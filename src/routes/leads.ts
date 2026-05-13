import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import {
  LEAD_STATUSES,
  getLead,
  listLeads,
  listMessages,
  updateLead,
  type LeadStatus,
} from '../services/leads.js';

const ListQuery = z.object({
  status: z.enum(LEAD_STATUSES as unknown as [LeadStatus, ...LeadStatus[]]).optional(),
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const PatchBody = z.object({
  status: z.enum(LEAD_STATUSES as unknown as [LeadStatus, ...LeadStatus[]]).optional(),
  notes: z.string().max(5000).optional(),
});

const PhoneParam = z.object({
  phone: z.string().regex(/^\d{6,20}$/, 'invalid phone'),
});

export async function leadsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/api/leads', async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', issues: parsed.error.issues });
    }
    return { leads: listLeads(parsed.data) };
  });

  app.get('/api/leads/:phone', async (req, reply) => {
    const parsed = PhoneParam.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_phone' });
    }
    const lead = getLead(parsed.data.phone);
    if (!lead) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return { lead };
  });

  app.get('/api/leads/:phone/messages', async (req, reply) => {
    const parsed = PhoneParam.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_phone' });
    }
    const lead = getLead(parsed.data.phone);
    if (!lead) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return { messages: listMessages(parsed.data.phone) };
  });

  app.patch('/api/leads/:phone', async (req, reply) => {
    const paramsParsed = PhoneParam.safeParse(req.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({ error: 'invalid_phone' });
    }
    const bodyParsed = PatchBody.safeParse(req.body);
    if (!bodyParsed.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: bodyParsed.error.issues });
    }
    if (
      bodyParsed.data.status === undefined &&
      bodyParsed.data.notes === undefined
    ) {
      return reply.code(400).send({ error: 'no_fields_to_update' });
    }

    const updated = updateLead(paramsParsed.data.phone, bodyParsed.data);
    if (!updated) {
      return reply.code(404).send({ error: 'not_found' });
    }
    return { lead: updated };
  });
}
