import type { FastifyBaseLogger } from 'fastify';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { db } from '../db/client.js';
import {
  DIGEST_RESPONSE_SCHEMA,
  DIGEST_SYSTEM_INSTRUCTION,
  type DigestOutput,
} from '../prompts/digest.js';
import { getArtifact, putArtifact } from './ai-artifacts.js';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface WeeklyNumbers {
  new_leads: number;
  qualified: number;
  contacted: number;
  hot: number;
  won: number;
  lost: number;
  calls: number;
  win_rate_pct: number;
}

interface WeeklyPayload {
  this_week: WeeklyNumbers;
  last_week: WeeklyNumbers;
  best_call: { name: string | null; phone: string; verdict: string } | null;
  at_risk: Array<{ name: string | null; phone: string; hours_stale: number }>;
  top_objection: string | null;
}

function gatherWeek(startMs: number, endMs: number): WeeklyNumbers {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS new_leads,
         SUM(CASE WHEN created_at >= ? AND created_at < ? AND status != 'new_qualified' THEN 1 ELSE 0 END) AS qualified,
         SUM(CASE WHEN last_status_change_at >= ? AND last_status_change_at < ? AND status = 'contacted' THEN 1 ELSE 0 END) AS contacted,
         SUM(CASE WHEN last_status_change_at >= ? AND last_status_change_at < ? AND status = 'hot' THEN 1 ELSE 0 END) AS hot,
         SUM(CASE WHEN last_status_change_at >= ? AND last_status_change_at < ? AND status = 'won' THEN 1 ELSE 0 END) AS won,
         SUM(CASE WHEN last_status_change_at >= ? AND last_status_change_at < ? AND status = 'lost' THEN 1 ELSE 0 END) AS lost
       FROM leads`
    )
    .get(
      startMs, endMs,
      startMs, endMs,
      startMs, endMs,
      startMs, endMs,
      startMs, endMs,
      startMs, endMs,
    ) as Record<string, number | null>;

  const calls = (db
    .prepare('SELECT COUNT(*) AS n FROM calls WHERE created_at >= ? AND created_at < ?')
    .get(startMs, endMs) as { n: number }).n;

  const won = row.won ?? 0;
  const lost = row.lost ?? 0;
  const decided = won + lost;
  const win_rate_pct = decided === 0 ? 0 : Math.round((won / decided) * 100);

  return {
    new_leads: row.new_leads ?? 0,
    qualified: row.qualified ?? 0,
    contacted: row.contacted ?? 0,
    hot: row.hot ?? 0,
    won,
    lost,
    calls,
    win_rate_pct,
  };
}

function gatherBestCall(startMs: number, endMs: number) {
  const row = db
    .prepare(
      `SELECT c.phone, c.verdict, l.name
         FROM calls c
         LEFT JOIN leads l ON l.phone = c.phone
        WHERE c.status = 'analyzed'
          AND c.verdict = 'hot'
          AND c.created_at >= ? AND c.created_at < ?
        ORDER BY c.verdict_confidence DESC, c.created_at DESC
        LIMIT 1`
    )
    .get(startMs, endMs) as { phone: string; verdict: string; name: string | null } | undefined;
  if (!row) return null;
  return { name: row.name, phone: row.phone, verdict: row.verdict };
}

function gatherAtRisk(): WeeklyPayload['at_risk'] {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const rows = db
    .prepare(
      `SELECT phone, name, COALESCE(last_contact_at, updated_at) AS touched
         FROM leads
        WHERE status = 'hot'
          AND COALESCE(last_contact_at, updated_at) < ?
        ORDER BY touched ASC
        LIMIT 5`
    )
    .all(cutoff) as Array<{ phone: string; name: string | null; touched: number }>;
  return rows.map((r) => ({
    name: r.name,
    phone: r.phone,
    hours_stale: Math.floor((Date.now() - r.touched) / (60 * 60 * 1000)),
  }));
}

function gatherTopObjection(startMs: number, endMs: number): string | null {
  const rows = db
    .prepare(
      `SELECT objections FROM calls
        WHERE status = 'analyzed' AND objections IS NOT NULL
          AND created_at >= ? AND created_at < ?`
    )
    .all(startMs, endMs) as Array<{ objections: string }>;

  const counts = new Map<string, { display: string; count: number }>();
  for (const r of rows) {
    let arr: unknown;
    try {
      arr = JSON.parse(r.objections);
    } catch {
      continue;
    }
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      const t = item.trim();
      if (!t) continue;
      const key = t.toLowerCase();
      const e = counts.get(key);
      if (e) e.count += 1;
      else counts.set(key, { display: t, count: 1 });
    }
  }
  const top = Array.from(counts.values()).sort((a, b) => b.count - a.count)[0];
  return top ? top.display : null;
}

export function buildDigestPayload(now = Date.now()): WeeklyPayload {
  const thisStart = now - WEEK_MS;
  const lastEnd = thisStart;
  const lastStart = lastEnd - WEEK_MS;
  return {
    this_week: gatherWeek(thisStart, now),
    last_week: gatherWeek(lastStart, lastEnd),
    best_call: gatherBestCall(thisStart, now),
    at_risk: gatherAtRisk(),
    top_objection: gatherTopObjection(thisStart, now),
  };
}

async function composeDigest(payload: WeeklyPayload): Promise<DigestOutput> {
  const response = await ai.models.generateContent({
    model: config.gemini.model,
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload, null, 2) }] }],
    config: {
      systemInstruction: DIGEST_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: DIGEST_RESPONSE_SCHEMA,
      temperature: 0.4,
    },
  });
  const text = response.text;
  if (!text) throw new Error('digest: empty response');
  const raw = JSON.parse(text) as Record<string, unknown>;
  return {
    subject: typeof raw.subject === 'string' ? raw.subject.trim() : 'Botifys weekly digest',
    body_markdown:
      typeof raw.body_markdown === 'string' ? raw.body_markdown.trim() : '',
  };
}

/** ISO week key like "2026-W20" — used as the artifact ref_key so we never re-send. */
function isoWeekKey(d: Date = new Date()): string {
  // Algorithm from ECMA-402 friendly source
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const week = 1 + Math.ceil((firstThursday - target.getTime()) / (7 * 24 * 3600 * 1000));
  const year = new Date(firstThursday).getUTCFullYear();
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export async function previewDigest(): Promise<{
  payload: WeeklyPayload;
  output: DigestOutput;
}> {
  const payload = buildDigestPayload();
  const output = await composeDigest(payload);
  return { payload, output };
}

/**
 * Send the weekly digest. Idempotent — if a digest for the current ISO week
 * is already in the artifact cache, we skip silently. Triggered by the cron
 * job in src/scheduler.ts every Monday morning.
 */
export async function runWeeklyDigest(log: FastifyBaseLogger): Promise<void> {
  const week = isoWeekKey();
  if (getArtifact('digest', week)) {
    log.info({ week }, 'digest already sent this week, skip');
    return;
  }

  const apiKey = config.alerts.resendApiKey;
  const to = config.scheduler.digestRecipient || config.alerts.toEmail;
  const from = config.alerts.fromEmail;

  if (!apiKey || !to) {
    log.info('digest: alerts not configured (RESEND_API_KEY / ALERT_EMAIL), skip');
    return;
  }

  const payload = buildDigestPayload();
  const output = await composeDigest(payload);
  const html = markdownToSafeHtml(output.body_markdown);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: output.subject,
      html,
      text: output.body_markdown,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`digest send failed (${res.status}): ${body}`);
  }

  putArtifact('digest', week, { subject: output.subject, sentAt: Date.now() }, null);
  log.info({ week, to }, 'weekly digest sent');
}

/**
 * Minimal markdown → HTML renderer for the subset our digest prompt emits:
 *   - blank-line-separated paragraphs
 *   - "# ", "## " headers
 *   - "- " bullet lists
 *   - **bold** inside text
 * Anything else is rendered as escaped plain text. No links, no images, no
 * raw HTML pass-through — safe to email without dompurify.
 */
function markdownToSafeHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inList = false;
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length > 0) {
      out.push(`<p style="margin:0 0 12px;line-height:1.55;">${formatInline(paraBuf.join(' '))}</p>`);
      paraBuf = [];
    }
  };
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      flushPara();
      closeList();
      continue;
    }
    if (line.startsWith('## ')) {
      flushPara(); closeList();
      out.push(`<h2 style="font-size:15px;margin:18px 0 8px;letter-spacing:0.04em;text-transform:uppercase;color:#525252;">${formatInline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      flushPara(); closeList();
      out.push(`<h1 style="font-size:22px;margin:0 0 12px;color:#0a0a0a;">${formatInline(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith('- ')) {
      flushPara();
      if (!inList) {
        out.push('<ul style="margin:0 0 12px 18px;padding:0;line-height:1.55;">');
        inList = true;
      }
      out.push(`<li style="margin:0 0 4px;">${formatInline(line.slice(2))}</li>`);
      continue;
    }
    closeList();
    paraBuf.push(line);
  }
  flushPara();
  closeList();

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0a0a0a;font-size:14px;max-width:560px;">${out.join('')}</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInline(s: string): string {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
