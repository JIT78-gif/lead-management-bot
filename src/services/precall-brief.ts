import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import {
  PRECALL_BRIEF_RESPONSE_SCHEMA,
  PRECALL_BRIEF_SYSTEM_INSTRUCTION,
  type PrecallBriefOutput,
} from '../prompts/precall-brief.js';
import { getLead, listMessages } from './leads.js';
import { db } from '../db/client.js';
import { getArtifact, putArtifact } from './ai-artifacts.js';
import type { CallRow } from './calls.js';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
const TTL_SEC = 60 * 60; // 1 hour

function validate(raw: unknown): PrecallBriefOutput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('precall-brief: non-object response');
  }
  const r = raw as Record<string, unknown>;
  const asStrings = (x: unknown): string[] =>
    Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [];
  return {
    headline: typeof r.headline === 'string' ? r.headline.trim() : '',
    signals: asStrings(r.signals).slice(0, 5),
    objections_expected: asStrings(r.objections_expected).slice(0, 5),
    opening_line: typeof r.opening_line === 'string' ? r.opening_line.trim() : '',
    do_not_say: asStrings(r.do_not_say).slice(0, 5),
  };
}

export async function getOrGeneratePrecallBrief(
  phone: string,
  opts: { force?: boolean } = {}
): Promise<PrecallBriefOutput | null> {
  if (!opts.force) {
    const cached = getArtifact<PrecallBriefOutput>('precall_brief', phone);
    if (cached) return cached.content;
  }

  const lead = getLead(phone);
  if (!lead) return null;

  const messages = listMessages(phone);
  const lastCall = db
    .prepare(
      `SELECT * FROM calls
        WHERE phone = ? AND status = 'analyzed'
        ORDER BY created_at DESC LIMIT 1`
    )
    .get(phone) as CallRow | undefined;

  const transcript = messages
    .map((m) => (m.direction === 'in' ? `Customer: ${m.text}` : `Bot: ${m.text}`))
    .join('\n');

  const userBlock = [
    '# Lead',
    `name: ${lead.name ?? 'unknown'}`,
    `industry: ${lead.industry ?? 'unknown'}`,
    `team_size: ${lead.team_size ?? 'unknown'}`,
    `website: ${lead.website_url ?? 'none'}`,
    `social: ${lead.social_handle ?? 'none'}`,
    `status: ${lead.status}`,
    lead.notes ? `notes: ${lead.notes}` : '',
    '',
    '# WhatsApp conversation',
    transcript || '(none yet)',
    '',
    lastCall && lastCall.summary
      ? `# Last call summary\n${lastCall.summary}\n# Last call verdict: ${lastCall.verdict ?? 'unknown'}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model: config.gemini.model,
    contents: [{ role: 'user', parts: [{ text: userBlock }] }],
    config: {
      systemInstruction: PRECALL_BRIEF_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: PRECALL_BRIEF_RESPONSE_SCHEMA,
      temperature: 0.5,
    },
  });

  const text = response.text;
  if (!text) throw new Error('precall-brief: empty response from Gemini');
  const output = validate(JSON.parse(text));
  putArtifact('precall_brief', phone, output, TTL_SEC);
  return output;
}
