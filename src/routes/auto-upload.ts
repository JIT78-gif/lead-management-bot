import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { getLead } from '../services/leads.js';
import { insertCall, type CallRow } from '../services/calls.js';
import { saveAudio, type SavedAudio } from '../services/audio-storage.js';
import { extractPhoneFromFilename, normalisePhone } from '../services/phone-extract.js';
import { analyzeCall } from '../services/ai-call-analysis.js';
import { updateAnalysis, markFailed } from '../services/calls.js';

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, Buffer.alloc(ab.length));
    return false;
  }
  return timingSafeEqual(ab, bb);
}

function fireAnalysis(call: CallRow, log: FastifyBaseLogger): void {
  setImmediate(async () => {
    try {
      const result = await analyzeCall(call.audio_path, call.mime_type);
      updateAnalysis(call.id, result);
      log.info(
        { callId: call.id, verdict: result.verdict, source: 'auto' },
        'auto-uploaded call analyzed'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      markFailed(call.id, msg);
      log.error({ err, callId: call.id }, 'auto-uploaded call analysis failed');
    }
  });
}

/**
 * Headless auto-upload endpoint for the salesperson's phone automation app
 * (Automate, MacroDroid, Tasker, etc.). Authenticated via a Bearer token,
 * NOT a session cookie — the phone app doesn't log in.
 *
 *   POST /api/calls/auto-upload
 *   Authorization: Bearer <AUTO_UPLOAD_TOKEN>
 *   multipart/form-data:
 *     audio:            <file>           required
 *     filename:         <string>         optional — original filename (Automate may rename the file before upload)
 *     phone:            <string>         optional — explicit phone hint, overrides filename extraction
 *     duration_seconds: <number>         optional
 */
export async function autoUploadRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/calls/auto-upload', async (req, reply) => {
    // 1. Bearer token check
    const auth = req.headers['authorization'] ?? '';
    const token =
      typeof auth === 'string' && auth.startsWith('Bearer ')
        ? auth.slice(7).trim()
        : '';

    if (!constantTimeEquals(token, config.autoUpload.token)) {
      app.log.warn(
        { ip: req.ip },
        'auto-upload rejected: invalid or missing bearer token'
      );
      return reply.code(401).send({ error: 'invalid_token' });
    }

    // 2. Parse multipart — collect fields and the file
    let originalFilename = '';
    let phoneHint = '';
    let durationSeconds: number | null = null;
    let saved: SavedAudio | null = null;
    let phone: string | null = null;

    try {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'filename') {
            originalFilename = String(part.value);
          } else if (part.fieldname === 'phone') {
            phoneHint = String(part.value);
          } else if (part.fieldname === 'duration_seconds') {
            const n = Number(part.value);
            if (Number.isFinite(n) && n >= 0) durationSeconds = Math.floor(n);
          }
          continue;
        }

        // part.type === 'file'
        if (part.fieldname !== 'audio') {
          part.file.resume();
          continue;
        }

        // Derive phone from explicit hint OR from a filename (prefer the
        // explicit `filename` field, fall back to the part's own filename).
        const nameForExtract =
          originalFilename || part.filename || '';
        const detected =
          (phoneHint && normalisePhone(phoneHint)) ||
          extractPhoneFromFilename(nameForExtract);

        if (!detected) {
          part.file.resume();
          app.log.warn(
            { filename: nameForExtract },
            'auto-upload rejected: phone not extractable'
          );
          return reply.code(400).send({
            error: 'no_phone',
            filename: nameForExtract,
          });
        }

        if (!getLead(detected)) {
          part.file.resume();
          app.log.info(
            { phone: detected, filename: nameForExtract },
            'auto-upload skipped: phone is not a qualified lead'
          );
          return reply.code(404).send({
            error: 'no_lead_found',
            phone: detected,
          });
        }

        phone = detected;
        saved = await saveAudio(
          phone,
          part.file,
          part.mimetype,
          nameForExtract || part.filename
        );
      }
    } catch (err) {
      app.log.error({ err }, 'auto-upload parse/save failed');
      return reply.code(400).send({ error: 'upload_failed' });
    }

    if (!saved || !phone) {
      return reply.code(400).send({ error: 'no_audio' });
    }

    const call = insertCall({
      phone,
      audioPath: saved.relativePath,
      audioSizeBytes: saved.sizeBytes,
      durationSeconds,
      mimeType: saved.mimeType,
    });

    fireAnalysis(call, app.log);

    app.log.info(
      { callId: call.id, phone, size: saved.sizeBytes },
      'auto-upload accepted'
    );
    return { call };
  });
}
