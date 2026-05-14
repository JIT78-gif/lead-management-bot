import type { FastifyBaseLogger } from 'fastify';
import { db } from '../db/client.js';
import { config } from '../config.js';
import { sendText } from './meta.js';
import type { LeadStatus } from './leads.js';

/**
 * Phase 5 — daily follow-up reminder.
 *
 * Runs once a day at REMINDER_HOUR_IST. For each salesperson phone in
 * SALESPERSON_PHONES, sends a single WhatsApp message listing leads that
 * are open AND haven't had any activity in the last 24 hours.
 *
 * Stays additive: derives the "last touched" timestamp at query-time by
 * MAX(updated_at, last_call_created_at) — no writes to existing tables.
 */

const STATUSES_TO_REMIND: readonly LeadStatus[] = [
  'new_qualified',
  'contacted',
  'hot',
];

interface StaleLeadRow {
  phone: string;
  name: string | null;
  industry: string | null;
  status: LeadStatus;
  last_touched_at: number;
}

const PRIORITY_RANK: Record<LeadStatus, number> = {
  hot: 0,
  new_qualified: 1,
  contacted: 2,
  cold: 3,
  won: 4,
  lost: 5,
};

export async function runDailyReminders(log: FastifyBaseLogger): Promise<void> {
  const phones = config.notify.salespersonPhones;
  if (phones.length === 0) {
    log.info('runDailyReminders: no SALESPERSON_PHONES configured, skip');
    return;
  }

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const placeholders = STATUSES_TO_REMIND.map(() => '?').join(',');

  const stale = db
    .prepare(
      `SELECT
         l.phone,
         l.name,
         l.industry,
         l.status,
         MAX(
           COALESCE(l.updated_at, 0),
           COALESCE(l.last_contact_at, 0),
           COALESCE((SELECT MAX(created_at) FROM calls c WHERE c.phone = l.phone), 0)
         ) AS last_touched_at
       FROM leads l
       WHERE l.status IN (${placeholders})`
    )
    .all(...STATUSES_TO_REMIND) as StaleLeadRow[];

  const due = stale
    .filter((r) => r.last_touched_at < cutoff)
    .sort((a, b) => {
      const r = PRIORITY_RANK[a.status] - PRIORITY_RANK[b.status];
      if (r !== 0) return r;
      return a.last_touched_at - b.last_touched_at;
    })
    .slice(0, 12);

  if (due.length === 0) {
    log.info('runDailyReminders: no stale leads, skip');
    return;
  }

  const body = formatReminder(due);

  for (const phone of phones) {
    try {
      await sendText(phone, body);
      log.info({ phone, count: due.length }, 'reminder sent');
    } catch (err) {
      log.warn(
        { err, phone },
        'reminder send failed (likely 24h window closed)'
      );
    }
  }
}

function formatReminder(rows: StaleLeadRow[]): string {
  const lines: string[] = [];
  lines.push(`🔔 ${rows.length} follow-up${rows.length === 1 ? '' : 's'} today:`);
  lines.push('');
  for (const r of rows) {
    const hoursAgo = Math.floor((Date.now() - r.last_touched_at) / (60 * 60 * 1000));
    const ago =
      hoursAgo < 48
        ? `${hoursAgo}h ago`
        : `${Math.floor(hoursAgo / 24)}d ago`;
    const tag =
      r.status === 'hot'
        ? '🔥 HOT'
        : r.status === 'new_qualified'
          ? '✨ NEW'
          : '· Contacted';
    const name = r.name ?? 'Unknown';
    const industry = r.industry ? ` (${r.industry})` : '';
    lines.push(`${tag} — ${name}${industry} · ${ago}`);
  }
  lines.push('');
  lines.push(`Open desk: ${config.notify.dashboardUrl}`);
  return lines.join('\n');
}

/**
 * Test helper exposed for the debug route. Returns the formatted message body
 * without sending anything.
 */
export function previewDailyReminder(): {
  count: number;
  body: string | null;
} {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const placeholders = STATUSES_TO_REMIND.map(() => '?').join(',');
  const stale = db
    .prepare(
      `SELECT
         l.phone, l.name, l.industry, l.status,
         MAX(
           COALESCE(l.updated_at, 0),
           COALESCE(l.last_contact_at, 0),
           COALESCE((SELECT MAX(created_at) FROM calls c WHERE c.phone = l.phone), 0)
         ) AS last_touched_at
       FROM leads l WHERE l.status IN (${placeholders})`
    )
    .all(...STATUSES_TO_REMIND) as StaleLeadRow[];
  const due = stale
    .filter((r) => r.last_touched_at < cutoff)
    .sort((a, b) => {
      const r = PRIORITY_RANK[a.status] - PRIORITY_RANK[b.status];
      if (r !== 0) return r;
      return a.last_touched_at - b.last_touched_at;
    })
    .slice(0, 12);
  return { count: due.length, body: due.length === 0 ? null : formatReminder(due) };
}
