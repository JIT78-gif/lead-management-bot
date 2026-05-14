import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import {
  COACHING_RESPONSE_SCHEMA,
  COACHING_SYSTEM_INSTRUCTION,
  type CoachingOutput,
} from '../prompts/coaching.js';
import { getCall } from './calls.js';
import { getArtifact, putArtifact } from './ai-artifacts.js';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

function validate(raw: unknown): CoachingOutput {
  if (!raw || typeof raw !== 'object') {
    throw new Error('coaching: non-object response');
  }
  const r = raw as Record<string, unknown>;
  const asStrings = (x: unknown): string[] =>
    Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [];
  return {
    wins: asStrings(r.wins).slice(0, 5),
    improvements: asStrings(r.improvements).slice(0, 5),
    missed_opportunity:
      typeof r.missed_opportunity === 'string' && r.missed_opportunity.trim() !== ''
        ? r.missed_opportunity.trim()
        : null,
    next_call_focus:
      typeof r.next_call_focus === 'string' ? r.next_call_focus.trim() : '',
  };
}

/**
 * Return coaching for a call. Cached forever per call (regeneration is a
 * separate explicit action). Returns null when the call hasn't been analyzed
 * yet — there's no transcript to coach against.
 */
export async function getOrGenerateCoaching(
  callId: number,
  opts: { force?: boolean } = {}
): Promise<CoachingOutput | null> {
  if (!opts.force) {
    const cached = getArtifact<CoachingOutput>('coaching', String(callId));
    if (cached) return cached.content;
  }

  const call = getCall(callId);
  if (!call) return null;
  if (call.status !== 'analyzed' || !call.transcript) return null;

  const objections = safeJsonArray(call.objections);
  const summary = safeJsonArray(call.summary);

  const userBlock = [
    `# Lead phone: ${call.phone}`,
    `# Verdict: ${call.verdict ?? 'unknown'} (confidence ${call.verdict_confidence ?? '?'})`,
    `# Verdict reasoning: ${call.verdict_reasoning ?? ''}`,
    '',
    summary.length > 0 ? `# Summary\n- ${summary.join('\n- ')}` : '',
    objections.length > 0 ? `# Objections raised\n- ${objections.join('\n- ')}` : '',
    '',
    '# Transcript',
    call.transcript,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model: config.gemini.model,
    contents: [{ role: 'user', parts: [{ text: userBlock }] }],
    config: {
      systemInstruction: COACHING_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: COACHING_RESPONSE_SCHEMA,
      temperature: 0.4,
    },
  });

  const text = response.text;
  if (!text) throw new Error('coaching: empty response from Gemini');
  const output = validate(JSON.parse(text));
  putArtifact('coaching', String(callId), output, null);
  return output;
}

function safeJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
