import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  CONVERSATION_FILTERS,
  getConversationDetail,
  listConversations,
  type ConversationFilter,
} from '../services/conversations.js';
import {
  appendHumanMessage,
  getConversation,
  manuallyDisqualify,
  manuallyQualify,
  resetConversation,
  setBotPaused,
  setConversationNotes,
} from '../services/leads.js';
import { sendText } from '../services/meta.js';

const ListQuery = z.object({
  filter: z
    .enum(CONVERSATION_FILTERS as unknown as [ConversationFilter, ...ConversationFilter[]])
    .optional(),
  search: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(300).optional(),
});

const PhoneParam = z.object({
  phone: z.string().regex(/^\d{6,20}$/, 'invalid phone'),
});

const SendBody = z.object({
  text: z.string().trim().min(1, 'empty message').max(4000, 'too long'),
});

const NotesBody = z.object({
  notes: z.string().max(5000).optional().nullable(),
});

export async function conversationsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // ─── List all conversations (the firehose view) ──────────────
  app.get('/api/conversations', async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query' });
    }
    const conversations = listConversations(parsed.data.filter ?? 'all', {
      limit: parsed.data.limit,
      search: parsed.data.search,
    });
    return { conversations };
  });

  // ─── Conversation detail (live transcript) ───────────────────
  app.get('/api/conversations/:phone', async (req, reply) => {
    const parsed = PhoneParam.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_phone' });
    }
    const detail = getConversationDetail(parsed.data.phone);
    if (!detail) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return detail;
  });

  // ─── Reset conversation (already exists for leads; mirrored here
  //     so a wrongly-disqualified prospect can be recovered with one tap
  //     directly from the chats view). Reuses the same DB transaction. ──
  app.post('/api/conversations/:phone/reset', async (req, reply) => {
    const parsed = PhoneParam.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_phone' });
    }
    const result = resetConversation(parsed.data.phone);
    return { ok: true, deleted: result };
  });

  // ─── Phase 6.5 — Manual takeover ─────────────────────────────
  //
  // The salesperson clicks "Take over chat" → bot stops auto-replying for
  // that phone. They click "Release to bot" → bot resumes on next inbound.

  app.post('/api/conversations/:phone/takeover', async (req, reply) => {
    const parsed = PhoneParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_phone' });
    const conv = getConversation(parsed.data.phone);
    if (!conv) return reply.code(404).send({ error: 'not_found' });
    setBotPaused(parsed.data.phone, true);
    return { ok: true, bot_paused: true };
  });

  app.post('/api/conversations/:phone/release', async (req, reply) => {
    const parsed = PhoneParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_phone' });
    const conv = getConversation(parsed.data.phone);
    if (!conv) return reply.code(404).send({ error: 'not_found' });
    setBotPaused(parsed.data.phone, false);
    return { ok: true, bot_paused: false };
  });

  // ─── Send a manual WhatsApp message ──────────────────────────
  //
  // Sends via Meta and records the row with sent_by='human'. Does NOT
  // auto-pause the bot — that's a deliberate separate action. (Most flows
  // will pause first; this lets the salesperson send a single nudge
  // without pausing if they want to.)

  app.post('/api/conversations/:phone/messages', async (req, reply) => {
    const params = PhoneParam.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_phone' });
    const body = SendBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'invalid_body',
        message: body.error.issues[0]?.message ?? 'invalid body',
      });
    }
    const conv = getConversation(params.data.phone);
    if (!conv) return reply.code(404).send({ error: 'not_found' });

    try {
      const metaId = await sendText(params.data.phone, body.data.text);
      appendHumanMessage(params.data.phone, body.data.text, metaId);
      return { ok: true, meta_message_id: metaId };
    } catch (err) {
      app.log.error(
        { err, phone: params.data.phone },
        'manual message send failed'
      );
      // 422 not 502 — most failures here are "outside 24h window" or
      // "invalid number", which are client-correctable, not server bugs.
      return reply.code(422).send({
        error: 'send_failed',
        message: err instanceof Error ? err.message : 'send failed',
      });
    }
  });

  // ─── Per-conversation notes ──────────────────────────────────
  //
  // Distinct from leads.notes (which only exists for qualified leads).
  // The salesperson uses this to track "called, no answer", "call back
  // Wed 4pm", etc. for ANY conversation, qualified or not.

  app.patch('/api/conversations/:phone', async (req, reply) => {
    const params = PhoneParam.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: 'invalid_phone' });
    const body = NotesBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    const conv = getConversation(params.data.phone);
    if (!conv) return reply.code(404).send({ error: 'not_found' });
    setConversationNotes(params.data.phone, body.data.notes ?? null);
    return { ok: true };
  });

  // ─── Manual qualify / disqualify ─────────────────────────────
  //
  // The salesperson calls a customer who never replied on WhatsApp, talks
  // to them, then comes back here and marks the outcome by hand. Bypasses
  // Gemini. Qualifying seeds a leads row (with whatever name + collected
  // data we already have) so it appears in the Leads tab and can be
  // worked normally.

  app.post('/api/conversations/:phone/qualify', async (req, reply) => {
    const parsed = PhoneParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_phone' });
    const ok = manuallyQualify(parsed.data.phone);
    if (!ok) return reply.code(404).send({ error: 'not_found' });
    return { ok: true, state: 'qualified' as const };
  });

  app.post('/api/conversations/:phone/disqualify', async (req, reply) => {
    const parsed = PhoneParam.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_phone' });
    const ok = manuallyDisqualify(parsed.data.phone);
    if (!ok) return reply.code(404).send({ error: 'not_found' });
    return { ok: true, state: 'disqualified' as const };
  });
}
