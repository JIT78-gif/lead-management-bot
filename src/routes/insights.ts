import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { previewDailyReminder, runDailyReminders } from '../services/reminders.js';
import { getOrGenerateCoaching } from '../services/coaching.js';
import { getOrGeneratePrecallBrief } from '../services/precall-brief.js';
import { previewDigest, runWeeklyDigest } from '../services/digest.js';
import { getOrGenerateWinPattern } from '../services/win-pattern.js';

const IdParam = z.object({
  id: z.coerce.number().int().positive(),
});

const PhoneParam = z.object({
  phone: z.string().regex(/^\d{6,20}$/, 'invalid phone'),
});

/**
 * Phase 5 insights endpoints. All auth-gated.
 *
 * Stage 2:  reminder preview + manual trigger (so the owner can verify
 *           without waiting for the 9 AM cron).
 * Stage 3:  coaching endpoints.
 * Stage 4:  pre-call brief endpoint.
 * Stage 5:  win-pattern + digest preview endpoints.
 */
export async function insightsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Returns what today's reminder would say. Sends nothing.
  app.get('/api/insights/reminders/preview', async () => {
    return previewDailyReminder();
  });

  // Manually fire the same job the cron fires. For owner-side testing.
  app.post('/api/insights/reminders/run', async (_req, reply) => {
    runDailyReminders(app.log).catch((err) =>
      app.log.error({ err }, 'manual reminder run failed')
    );
    reply.send({ ok: true, scheduled: true });
  });

  // ─── Call coaching ────────────────────────────────────────────
  // Returns cached coaching or generates on demand. 200 with coaching=null
  // when the call hasn't been analyzed yet (the frontend hides the card).
  app.get('/api/calls/:id/coaching', async (req, reply) => {
    const parsed = IdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_id' });
    try {
      const coaching = await getOrGenerateCoaching(parsed.data.id);
      return { coaching };
    } catch (err) {
      app.log.error({ err, callId: parsed.data.id }, 'coaching generation failed');
      return reply.code(502).send({ error: 'coaching_failed' });
    }
  });

  // ─── Pre-call brief ──────────────────────────────────────────
  app.get('/api/leads/:phone/precall-brief', async (req, reply) => {
    const parsed = PhoneParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_phone' });
    try {
      const brief = await getOrGeneratePrecallBrief(parsed.data.phone);
      return { brief };
    } catch (err) {
      app.log.error({ err, phone: parsed.data.phone }, 'precall brief failed');
      return reply.code(502).send({ error: 'brief_failed' });
    }
  });

  app.post('/api/leads/:phone/precall-brief/refresh', async (req, reply) => {
    const parsed = PhoneParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_phone' });
    try {
      const brief = await getOrGeneratePrecallBrief(parsed.data.phone, { force: true });
      return { brief };
    } catch (err) {
      app.log.error({ err, phone: parsed.data.phone }, 'precall brief refresh failed');
      return reply.code(502).send({ error: 'brief_failed' });
    }
  });

  // Force re-generation, bypassing cache.
  app.post('/api/calls/:id/coaching/refresh', async (req, reply) => {
    const parsed = IdParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_id' });
    try {
      const coaching = await getOrGenerateCoaching(parsed.data.id, { force: true });
      return { coaching };
    } catch (err) {
      app.log.error({ err, callId: parsed.data.id }, 'coaching refresh failed');
      return reply.code(502).send({ error: 'coaching_failed' });
    }
  });

  // ─── Weekly digest (preview + manual send) ───────────────────
  app.get('/api/insights/digest/preview', async (_req, reply) => {
    try {
      const result = await previewDigest();
      return result;
    } catch (err) {
      app.log.error({ err }, 'digest preview failed');
      return reply.code(502).send({ error: 'digest_failed' });
    }
  });

  app.post('/api/insights/digest/send', async (_req, reply) => {
    try {
      await runWeeklyDigest(app.log);
      return { ok: true };
    } catch (err) {
      app.log.error({ err }, 'digest manual send failed');
      return reply.code(502).send({ error: 'digest_failed' });
    }
  });

  // ─── Win-pattern analysis ────────────────────────────────────
  app.get('/api/insights/win-pattern', async (_req, reply) => {
    try {
      return await getOrGenerateWinPattern();
    } catch (err) {
      app.log.error({ err }, 'win-pattern failed');
      return reply.code(502).send({ error: 'win_pattern_failed' });
    }
  });

  app.post('/api/insights/win-pattern/refresh', async (_req, reply) => {
    try {
      return await getOrGenerateWinPattern({ force: true });
    } catch (err) {
      app.log.error({ err }, 'win-pattern refresh failed');
      return reply.code(502).send({ error: 'win_pattern_failed' });
    }
  });
}
