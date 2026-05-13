import { db } from '../db/client.js';

export type ConversationState =
  | 'qualifying'
  | 'collecting'
  | 'qualified'
  | 'disqualified';

export type Direction = 'in' | 'out';

export type TeamSize = 'solo' | '2-5' | '6-10' | '11-25' | '25+';

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

export interface MessageRow {
  direction: Direction;
  text: string;
  created_at: number;
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

const stmtInsertMessage = db.prepare(
  `INSERT OR IGNORE INTO messages (phone, direction, text, meta_message_id, created_at)
   VALUES (@phone, @direction, @text, @meta_message_id, @created_at)`
);

const stmtListMessages = db.prepare<[string]>(
  `SELECT direction, text, created_at FROM messages
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
