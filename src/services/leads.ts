import { db } from '../db/client.js';

export type ConversationState =
  | 'qualifying'
  | 'collecting'
  | 'qualified'
  | 'disqualified';

export type Direction = 'in' | 'out';

export type TeamSize = 'solo' | '2-5' | '6-10' | '11-25' | '25+';

export type LeadStatus =
  | 'new_qualified'
  | 'contacted'
  | 'hot'
  | 'cold'
  | 'won'
  | 'lost';

export const LEAD_STATUSES: readonly LeadStatus[] = [
  'new_qualified',
  'contacted',
  'hot',
  'cold',
  'won',
  'lost',
] as const;

export interface ConversationRow {
  phone: string;
  whatsapp_name: string | null;
  state: ConversationState;
  collected: string;
  created_at: number;
  updated_at: number;
}

export interface LeadData {
  name: string | null;
  industry: string | null;
  team_size: TeamSize | null;
  website_url: string | null;
  social_handle: string | null;
}

export interface LeadRow {
  id: number;
  phone: string;
  name: string | null;
  industry: string | null;
  team_size: TeamSize | null;
  website_url: string | null;
  social_handle: string | null;
  status: LeadStatus;
  notes: string | null;
  last_status_change_at: number | null;
  created_at: number;
  updated_at: number;
}

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageRow {
  direction: Direction;
  text: string;
  created_at: number;
  delivery_status?: DeliveryStatus | null;
  delivery_error?: string | null;
  status_updated_at?: number | null;
}

export interface ListLeadsFilters {
  status?: LeadStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface UpdateLeadPatch {
  status?: LeadStatus;
  notes?: string | null;
}

const now = (): number => Date.now();

const stmtGetConversation = db.prepare<[string]>(
  'SELECT * FROM conversations WHERE phone = ?'
);

const stmtInsertConversation = db.prepare(
  `INSERT INTO conversations (phone, whatsapp_name, state, collected, created_at, updated_at)
   VALUES (@phone, @whatsapp_name, @state, '{}', @created_at, @updated_at)`
);

const stmtUpdateConversation = db.prepare(
  `UPDATE conversations
   SET state = @state, collected = @collected, updated_at = @updated_at,
       whatsapp_name = COALESCE(whatsapp_name, @whatsapp_name)
   WHERE phone = @phone`
);

// Phase 6: outbound rows are inserted with delivery_status='sent' so the
// dashboard can show a ✓ tick from the moment the message leaves us; the
// status webhook later upgrades them to 'delivered' / 'read' or 'failed'.
// Inbound rows leave delivery_status NULL (concept doesn't apply).
const stmtInsertMessage = db.prepare(
  `INSERT OR IGNORE INTO messages
     (phone, direction, text, meta_message_id, delivery_status, status_updated_at, created_at)
   VALUES (
     @phone,
     @direction,
     @text,
     @meta_message_id,
     CASE WHEN @direction = 'out' THEN 'sent' ELSE NULL END,
     CASE WHEN @direction = 'out' THEN @created_at ELSE NULL END,
     @created_at
   )`
);

const stmtUpdateMessageStatus = db.prepare(
  `UPDATE messages
      SET delivery_status   = @status,
          delivery_error    = @error,
          status_updated_at = @ts
    WHERE meta_message_id = @meta_message_id
      AND direction = 'out'
      AND (
        delivery_status IS NULL
        OR delivery_status = 'sent'
        OR (delivery_status = 'delivered' AND @status IN ('read', 'failed'))
        OR (delivery_status = 'read' AND @status = 'failed')
      )`
);

const stmtListMessages = db.prepare<[string]>(
  `SELECT direction, text, created_at,
          delivery_status, delivery_error, status_updated_at
     FROM messages
    WHERE phone = ? ORDER BY id ASC`
);

const stmtUpsertLead = db.prepare(
  `INSERT INTO leads (phone, name, industry, team_size, website_url, social_handle, status, created_at, updated_at)
   VALUES (@phone, @name, @industry, @team_size, @website_url, @social_handle, 'new_qualified', @created_at, @updated_at)
   ON CONFLICT(phone) DO UPDATE SET
     name = excluded.name,
     industry = excluded.industry,
     team_size = excluded.team_size,
     website_url = excluded.website_url,
     social_handle = excluded.social_handle,
     updated_at = excluded.updated_at`
);

export function getConversation(phone: string): ConversationRow | undefined {
  return stmtGetConversation.get(phone) as ConversationRow | undefined;
}

export function getOrCreateConversation(
  phone: string,
  whatsappName: string | null
): ConversationRow {
  const existing = getConversation(phone);
  if (existing) return existing;

  const ts = now();
  stmtInsertConversation.run({
    phone,
    whatsapp_name: whatsappName,
    state: 'qualifying',
    created_at: ts,
    updated_at: ts,
  });
  return getConversation(phone)!;
}

export function updateConversation(
  phone: string,
  state: ConversationState,
  collected: Partial<LeadData>,
  whatsappName: string | null = null
): void {
  stmtUpdateConversation.run({
    phone,
    state,
    collected: JSON.stringify(collected),
    whatsapp_name: whatsappName,
    updated_at: now(),
  });
}

/**
 * Insert a message. Returns true if newly inserted, false if it was a duplicate
 * (same meta_message_id already seen). Use the return value for idempotency.
 */
export function appendMessage(
  phone: string,
  direction: Direction,
  text: string,
  metaMessageId: string | null
): boolean {
  const result = stmtInsertMessage.run({
    phone,
    direction,
    text,
    meta_message_id: metaMessageId,
    created_at: now(),
  });
  return result.changes > 0;
}

export function listMessages(phone: string): MessageRow[] {
  return stmtListMessages.all(phone) as MessageRow[];
}

/**
 * Phase 6 — Apply a Meta delivery-status update to an outbound message.
 *
 * Idempotent: only advances state monotonically (sent → delivered → read,
 * or any state → failed). Older/repeated events are ignored. Returns true
 * when a row was actually updated.
 */
export function applyStatusUpdate(
  metaMessageId: string,
  status: DeliveryStatus,
  errorMessage: string | null,
  timestampMs: number
): boolean {
  const res = stmtUpdateMessageStatus.run({
    meta_message_id: metaMessageId,
    status,
    error: status === 'failed' ? errorMessage : null,
    ts: timestampMs,
  });
  return res.changes > 0;
}

/**
 * Wipe everything we know about a phone number — conversation state,
 * messages, lead row. The next inbound message creates a fresh conversation
 * so the bot starts the qualifying flow from scratch. Useful when a customer
 * was disqualified by mistake, or for resetting your own test number.
 */
const stmtDeleteCallsByPhone = db.prepare<[string]>('DELETE FROM calls WHERE phone = ?');
const stmtDeleteMessagesByPhone = db.prepare<[string]>('DELETE FROM messages WHERE phone = ?');
const stmtDeleteLeadByPhone = db.prepare<[string]>('DELETE FROM leads WHERE phone = ?');
const stmtDeleteConversationByPhone = db.prepare<[string]>('DELETE FROM conversations WHERE phone = ?');

export function resetConversation(phone: string): {
  conversation: number;
  messages: number;
  lead: number;
  calls: number;
} {
  const tx = db.transaction((p: string) => {
    const calls = stmtDeleteCallsByPhone.run(p).changes;
    const messages = stmtDeleteMessagesByPhone.run(p).changes;
    const lead = stmtDeleteLeadByPhone.run(p).changes;
    const conversation = stmtDeleteConversationByPhone.run(p).changes;
    return { conversation, messages, lead, calls };
  });
  return tx(phone);
}

export function saveQualifiedLead(phone: string, data: LeadData): void {
  const ts = now();
  stmtUpsertLead.run({
    phone,
    name: data.name,
    industry: data.industry,
    team_size: data.team_size,
    website_url: data.website_url,
    social_handle: data.social_handle,
    created_at: ts,
    updated_at: ts,
  });
}

// --- Phase 2 dashboard queries ---

const stmtGetLead = db.prepare<[string]>('SELECT * FROM leads WHERE phone = ?');

export function getLead(phone: string): LeadRow | undefined {
  return stmtGetLead.get(phone) as LeadRow | undefined;
}

export function listLeads(filters: ListLeadsFilters = {}): LeadRow[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.status) {
    where.push('status = @status');
    params.status = filters.status;
  }

  if (filters.search && filters.search.trim() !== '') {
    where.push(
      '(LOWER(name) LIKE @search OR LOWER(industry) LIKE @search OR phone LIKE @search)'
    );
    params.search = `%${filters.search.trim().toLowerCase()}%`;
  }

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const sql = `
    SELECT * FROM leads
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return db.prepare(sql).all(params) as LeadRow[];
}

const stmtUpdateLeadFields = db.prepare(
  `UPDATE leads SET
     status = COALESCE(@status, status),
     notes = COALESCE(@notes_new, notes),
     last_status_change_at = COALESCE(@last_status_change_at, last_status_change_at),
     updated_at = @updated_at
   WHERE phone = @phone`
);

/**
 * Patch one or more mutable fields on a lead. Returns the updated row, or
 * undefined if no lead exists at that phone.
 */
export function updateLead(
  phone: string,
  patch: UpdateLeadPatch
): LeadRow | undefined {
  const current = getLead(phone);
  if (!current) return undefined;

  const ts = now();
  const statusChanged =
    patch.status !== undefined && patch.status !== current.status;

  stmtUpdateLeadFields.run({
    phone,
    status: patch.status ?? null,
    notes_new: patch.notes === undefined ? null : patch.notes,
    last_status_change_at: statusChanged ? ts : null,
    updated_at: ts,
  });

  return getLead(phone);
}
