import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  CONVERSATION_FILTERS,
  getConversationDetail,
  listConversations,
  type ConversationFilter,
} from '../services/conversations.js';
import { resetConversation } from '../services/leads.js';

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
}
