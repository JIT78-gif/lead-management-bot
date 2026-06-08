import { Type, type Schema } from '@google/genai';
import { callJsonModel } from './llm.js';

/**
 * Parse a customer's natural-language preferred Meet time into a real
 * ISO datetime. The customer might say "tomorrow afternoon", "Tue 4 PM
 * Dubai time", "next Wed 10 am AEST" — Gemini handles the heavy
 * lifting; we just enforce a tight JSON shape and return either a
 * parsed result or a structured failure reason.
 */

export type ParseResult =
  | {
      ok: true;
      iso_datetime: string;     // UTC ISO string, ready for Calendar API
      timezone_label: string;   // human-readable TZ they referred to
      human: string;            // friendly echo for the bot reply
    }
  | {
      ok: false;
      reason: 'ambiguous_no_date' | 'in_past' | 'unparseable';
      detail?: string;
    };

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    ok: { type: Type.BOOLEAN },
    iso_datetime: { type: Type.STRING, nullable: true },
    timezone_label: { type: Type.STRING, nullable: true },
    human: { type: Type.STRING, nullable: true },
    reason: {
      type: Type.STRING,
      enum: ['ambiguous_no_date', 'in_past', 'unparseable'],
      nullable: true,
    },
    detail: { type: Type.STRING, nullable: true },
  },
  required: ['ok', 'iso_datetime', 'timezone_label', 'human', 'reason', 'detail'],
};

const SYSTEM = `
You convert a customer's natural-language description of a desired meeting
time into a precise ISO 8601 UTC datetime. Output strict JSON only.

You will receive:
  - the customer's text (e.g. "Tuesday 4 PM Dubai time", "tomorrow 10am",
    "next Wed 2pm EST")
  - the current UTC datetime ("now")
  - the assumed default timezone if the customer doesn't mention one

Rules:
  - If the customer's text is a clear date+time (or relative time), set
    ok=true and return:
      iso_datetime: the UTC ISO string (e.g. "2026-06-09T13:00:00Z")
      timezone_label: a human-readable timezone label they referred to
                      (e.g. "Asia/Dubai", "America/New_York", or
                      "default" if they didn't say one)
      human: a short friendly echo (e.g. "Tue 4 PM Dubai time")
  - If they gave only a time but no date ("at 4 PM") and you can't pick
    today/tomorrow safely → ok=false, reason="ambiguous_no_date".
  - If the resulting datetime is in the past → ok=false, reason="in_past".
  - If you can't parse the text at all → ok=false, reason="unparseable".
  - When ok=false the parsed fields should be null.

NEVER invent a time the customer didn't say. Be conservative; ambiguous
is better than wrong.
`.trim();

export async function parseMeetTime(
  customerText: string,
  defaultTimezone: string
): Promise<ParseResult> {
  const nowIso = new Date().toISOString();
  const userMsg = `now_utc=${nowIso}
default_timezone=${defaultTimezone}
customer_text=${JSON.stringify(customerText)}`;

  const { text } = await callJsonModel({
    systemInstruction: SYSTEM,
    contents: [{ role: 'user', text: userMsg }],
    responseSchema: SCHEMA,
    temperature: 0.1,
  });

  const raw = JSON.parse(text) as Record<string, unknown>;
  if (raw.ok === true && typeof raw.iso_datetime === 'string') {
    const iso = new Date(raw.iso_datetime);
    if (Number.isNaN(iso.getTime())) {
      return { ok: false, reason: 'unparseable', detail: 'invalid iso string' };
    }
    if (iso.getTime() < Date.now()) {
      return { ok: false, reason: 'in_past' };
    }
    return {
      ok: true,
      iso_datetime: iso.toISOString(),
      timezone_label: typeof raw.timezone_label === 'string' ? raw.timezone_label : 'default',
      human: typeof raw.human === 'string' ? raw.human : customerText,
    };
  }

  const reason = (raw.reason as ParseResult extends { reason: infer R } ? R : never) ?? 'unparseable';
  return {
    ok: false,
    reason: (['ambiguous_no_date', 'in_past', 'unparseable'].includes(reason as string)
      ? reason
      : 'unparseable') as 'ambiguous_no_date' | 'in_past' | 'unparseable',
    detail: typeof raw.detail === 'string' ? raw.detail : undefined,
  };
}
