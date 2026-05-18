import { db } from '../db/client.js';
import type {
  ConversationState,
  Direction,
  LeadStatus,
  MessageRow,
} from './leads.js';

/**
 * Phase 6 — list & detail queries that span EVERY WhatsApp conversation,
 * not just qualified leads. Powers the new "Chats" dashboard tab.
 *
 * The leads dashboard already covers `state='qualified'`; this view exists
 * so the owner can see prospects who are mid-flow, dropped off, or got
 * wrongly disqualified by the bot — none of which currently surface
 * anywhere visible.
 */

export type ConversationFilter = 'all' | 'active' | 'stalled' | 'disqualified';

const ACTIVE_STATES = ['qualifying', 'collecting'] as const;
type ActiveState = (typeof ACTIVE_STATES)[number];
const ACTIVE_STATE_SET: Set<string> = new Set(ACTIVE_STATES);

// Stall thresholds (ms). Tuned in the plan; bump in one place if the rules
// change later.
const STALL_AFTER_BOT_REPLY_MS = 10 * 60 * 1000;        // customer hasn't replied in 10 min
const STALL_AFTER_CUSTOMER_MSG_MS = 30 * 60 * 1000;     // bot hasn't replied in 30 min
const WAITING_ON_BOT_MS = 60 * 1000;                    // 1 min = "waiting on bot" dot

export interface ConversationListRow {
  phone: string;
  whatsapp_name: string | null;
  state: ConversationState;
  created_at: number;
  updated_at: number;
  inbound_count: number;
  outbound_count: number;
  last_message_at: number | null;
  last_message_direction: Direction | null;
  last_message_text: string | null;
  last_inbound_at: number | null;
  last_outbound_at: number | null;
  lead_status: LeadStatus | null;
  is_stalled: boolean;
  is_waiting_on_bot: boolean;
  bot_paused: boolean;
}

interface RawRow {
  phone: string;
  whatsapp_name: string | null;
  state: ConversationState;
  created_at: number;
  updated_at: number;
  bot_paused: number;
  inbound_count: number;
  outbound_count: number;
  last_message_at: number | null;
  last_message_direction: Direction | null;
  last_message_text: string | null;
  last_inbound_at: number | null;
  last_outbound_at: number | null;
  lead_status: LeadStatus | null;
}

// One CTE-free query — joins conversations to messages aggregates and to
// leads. Sub-selects keep this readable; SQLite handles them fine at the
// scale we're targeting.
const stmtListConversations = db.prepare(
  `SELECT
     c.phone,
     c.whatsapp_name,
     c.state,
     c.created_at,
     c.updated_at,
     c.bot_paused,
     (SELECT COUNT(*)  FROM messages m WHERE m.phone = c.phone AND m.direction = 'in')           AS inbound_count,
     (SELECT COUNT(*)  FROM messages m WHERE m.phone = c.phone AND m.direction = 'out')          AS outbound_count,
     (SELECT MAX(created_at) FROM messages m WHERE m.phone = c.phone)                            AS last_message_at,
     (SELECT direction       FROM messages m WHERE m.phone = c.phone ORDER BY id DESC LIMIT 1)   AS last_message_direction,
     (SELECT text            FROM messages m WHERE m.phone = c.phone ORDER BY id DESC LIMIT 1)   AS last_message_text,
     (SELECT MAX(created_at) FROM messages m WHERE m.phone = c.phone AND m.direction = 'in')     AS last_inbound_at,
     (SELECT MAX(created_at) FROM messages m WHERE m.phone = c.phone AND m.direction = 'out')    AS last_outbound_at,
     l.status                                                                                    AS lead_status
   FROM conversations c
   LEFT JOIN leads l ON l.phone = c.phone
   ORDER BY COALESCE(
     (SELECT MAX(created_at) FROM messages m WHERE m.phone = c.phone),
     c.updated_at
   ) DESC
   LIMIT ?`
);

function computeFlags(
  row: RawRow,
  now: number
): { is_stalled: boolean; is_waiting_on_bot: boolean } {
  const isActive = ACTIVE_STATE_SET.has(row.state);
  const last = row.last_message_at ?? row.updated_at;
  const age = now - last;

  // Paused conversations are intentionally silent — don't flag "waiting on
  // bot" or "stalled" because the silence is by design.
  if (row.bot_paused === 1) {
    return { is_stalled: false, is_waiting_on_bot: false };
  }

  if (!isActive) {
    return { is_stalled: false, is_waiting_on_bot: false };
  }

  if (row.last_message_direction === 'out') {
    // Bot replied last → customer hasn't answered.
    return {
      is_stalled: age >= STALL_AFTER_BOT_REPLY_MS,
      is_waiting_on_bot: false,
    };
  }

  if (row.last_message_direction === 'in') {
    // Customer messaged last → bot owes a reply. After ~1 min it's a dot;
    // after 30 min something is clearly wrong and we flag it as stalled.
    return {
      is_stalled: age >= STALL_AFTER_CUSTOMER_MSG_MS,
      is_waiting_on_bot: age >= WAITING_ON_BOT_MS,
    };
  }

  return { is_stalled: false, is_waiting_on_bot: false };
}

export function listConversations(
  filter: ConversationFilter,
  opts: { limit?: number; search?: string } = {}
): ConversationListRow[] {
  // Slightly higher cap than leads since this is the firehose view.
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 300);
  const rows = stmtListConversations.all(limit) as RawRow[];
  const now = Date.now();

  const enriched: ConversationListRow[] = rows.map((r) => {
    const flags = computeFlags(r, now);
    return { ...r, ...flags, bot_paused: r.bot_paused === 1 };
  });

  let filtered = enriched;
  if (filter === 'active') {
    filtered = enriched.filter((r) => ACTIVE_STATE_SET.has(r.state));
  } else if (filter === 'stalled') {
    filtered = enriched.filter((r) => r.is_stalled);
  } else if (filter === 'disqualified') {
    filtered = enriched.filter((r) => r.state === 'disqualified');
  }

  const search = opts.search?.trim().toLowerCase();
  if (search) {
    filtered = filtered.filter(
      (r) =>
        r.phone.includes(search) ||
        (r.whatsapp_name?.toLowerCase().includes(search) ?? false) ||
        (r.last_message_text?.toLowerCase().includes(search) ?? false)
    );
  }

  return filtered;
}

export interface ConversationDetail {
  phone: string;
  whatsapp_name: string | null;
  state: ConversationState;
  created_at: number;
  updated_at: number;
  lead_status: LeadStatus | null;
  lead_id: number | null;
  is_stalled: boolean;
  is_waiting_on_bot: boolean;
  bot_paused: boolean;
  notes: string | null;
  messages: MessageRow[];
}

const stmtGetConversation = db.prepare<[string]>(
  `SELECT c.phone, c.whatsapp_name, c.state, c.created_at, c.updated_at,
          c.bot_paused, c.notes,
          l.id AS lead_id, l.status AS lead_status
     FROM conversations c
     LEFT JOIN leads l ON l.phone = c.phone
    WHERE c.phone = ?`
);

const stmtMessagesForConvo = db.prepare<[string]>(
  `SELECT direction, text, created_at,
          delivery_status, delivery_error, status_updated_at
     FROM messages
    WHERE phone = ? ORDER BY id ASC`
);

interface ConvoRawRow {
  phone: string;
  whatsapp_name: string | null;
  state: ConversationState;
  created_at: number;
  updated_at: number;
  bot_paused: number;
  notes: string | null;
  lead_id: number | null;
  lead_status: LeadStatus | null;
}

export function getConversationDetail(phone: string): ConversationDetail | null {
  const row = stmtGetConversation.get(phone) as ConvoRawRow | undefined;
  if (!row) return null;

  const messages = stmtMessagesForConvo.all(phone) as MessageRow[];
  const last = messages[messages.length - 1];
  const fakeRaw: RawRow = {
    phone: row.phone,
    whatsapp_name: row.whatsapp_name,
    state: row.state,
    created_at: row.created_at,
    updated_at: row.updated_at,
    bot_paused: row.bot_paused,
    inbound_count: 0,
    outbound_count: 0,
    last_message_at: last?.created_at ?? null,
    last_message_direction: last?.direction ?? null,
    last_message_text: last?.text ?? null,
    last_inbound_at: null,
    last_outbound_at: null,
    lead_status: row.lead_status,
  };
  const flags = computeFlags(fakeRaw, Date.now());

  return {
    phone: row.phone,
    whatsapp_name: row.whatsapp_name,
    state: row.state,
    created_at: row.created_at,
    updated_at: row.updated_at,
    lead_status: row.lead_status,
    lead_id: row.lead_id,
    bot_paused: row.bot_paused === 1,
    notes: row.notes,
    ...flags,
    messages,
  };
}

// Re-exported so the route can hint at the public filter values.
export const CONVERSATION_FILTERS: readonly ConversationFilter[] = [
  'all',
  'active',
  'stalled',
  'disqualified',
] as const;

// Silence unused-import warnings for the type re-export when this module
// is consumed only via the route.
export type { ActiveState };
