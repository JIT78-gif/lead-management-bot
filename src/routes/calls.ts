import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getLead } from '../services/leads.js';
import {
  deleteCall,
  getCall,
  insertCall,
  listCallsByPhone,
  markFailed,
  markProcessing,
  updateAnalysis,
  type CallRow,
} from '../services/calls.js';
import {
  audioStat,
  deleteAudio,
  openAudioStream,
  saveAudio,
  type SavedAudio,
} from '../services/audio-storage.js';
import { analyzeCall } from '../services/ai-call-analysis.js';

const PhoneParam = z.object({
  phone: z.string().regex(/^\d{6,20}$/, 'invalid phone'),
});

const IdParam = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Run AI analysis on a stored call in the background. Caller responds 200
 * immediately; this updates the row when analysis completes (or fails).
 */
function fireAnalysis(call: CallRow, log: FastifyBaseLogger): void {
  setImmediate(async () => {
    try {
      const result = await analyzeCall(call.audio_path, call.mime_type);
      updateAnalysis(call.id, result);
      log.info({ callId: call.id, verdict: result.verdict }, 'call analyzed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      markFailed(call.id, msg);
      log.error({ err, callId: call.id }, 'call analysis failed');
    }
  });
}

export async function callsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // ─── Upload a new call recording ──────────────────────────────
  app.post('/api/leads/:phone/calls', async (req, reply) => {
    const paramsParsed = PhoneParam.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({ error: 'invalid_phone' });
    }
    const phone = paramsParsed.data.phone;

    if (!getLead(phone)) {
      return reply.code(404).send({ error: 'lead_not_found' });
    }

    // Read the multipart body in order — file first, then any fields.
    let saved: SavedAudio | null = null;
    let durationSeconds: number | null = null;

    try {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          if (part.fieldname !== 'audio') {
            // Drain unwanted file to keep iterator unstuck
            part.file.resume();
            continue;
          }
          saved = await saveAudio(
            phone,
            part.file,
            part.mimetype,
            part.filename
          );
        } else if (part.type === 'field' && part.fieldname === 'duration_seconds') {
          const n = Number(part.value);
          if (Number.isFinite(n) && n >= 0) durationSeconds = Math.floor(n);
        }
      }
    } catch (err) {
      app.log.error({ err, phone }, 'audio upload failed');
      return reply.code(400).send({ error: 'upload_failed' });
    }

    if (!saved) {
      return reply.code(400).send({ error: 'no_audio_file' });
    }

    const call = insertCall({
      phone,
      audioPath: saved.relativePath,
      audioSizeBytes: saved.sizeBytes,
      durationSeconds,
      mimeType: saved.mimeType,
    });

    fireAnalysis(call, app.log);

    return { call };
  });

  // ─── List calls for a lead ────────────────────────────────────
  app.get('/api/leads/:phone/calls', async (req, reply) => {
    const parsed = PhoneParam.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_phone' });
    }
    if (!getLead(parsed.data.phone)) {
      return reply.code(404).send({ error: 'lead_not_found' });
    }
    return { calls: listCallsByPhone(parsed.data.phone) };
  });

  // ─── Get a single call by id ──────────────────────────────────
  app.get('/api/calls/:id', async (req, reply) => {
    const parsed = IdParam.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_id' });
    }
    const call = getCall(parsed.data.id);
    if (!call) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return { call };
  });

  // ─── Stream audio file ────────────────────────────────────────
  app.get('/api/calls/:id/audio', async (req, reply) => {
    const parsed = IdParam.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_id' });
    }
    const call = getCall(parsed.data.id);
    if (!call) {
      return reply.code(404).send({ error: 'not_found' });
    }
    try {
      const stat = audioStat(call.audio_path);
      const stream = openAudioStream(call.audio_path);
      reply
        .type(call.mime_type)
        .header('Content-Length', stat.size)
        .header('Accept-Ranges', 'none');
      return reply.send(stream);
    } catch (err) {
      app.log.error({ err, callId: call.id }, 'audio stream failed');
      return reply.code(404).send({ error: 'audio_not_found' });
    }
  });

  // ─── Delete a call (file + row) ───────────────────────────────
  app.delete('/api/calls/:id', async (req, reply) => {
    const parsed = IdParam.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_id' });
    }
    const call = getCall(parsed.data.id);
    if (!call) {
      return reply.code(404).send({ error: 'not_found' });
    }
    deleteAudio(call.audio_path);
    deleteCall(call.id);
    return { ok: true };
  });

  // ─── Re-analyze a call ────────────────────────────────────────
  app.post('/api/calls/:id/analyze', async (req, reply) => {
    const parsed = IdParam.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_id' });
    }
    const call = getCall(parsed.data.id);
    if (!call) {
      return reply.code(404).send({ error: 'not_found' });
    }

    markProcessing(call.id);
    const fresh = getCall(call.id)!;
    fireAnalysis(fresh, app.log);
    return { call: fresh };
  });
}
