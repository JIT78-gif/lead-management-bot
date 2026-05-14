import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { db } from '../db/client.js';
import {
  WIN_PATTERN_RESPONSE_SCHEMA,
  WIN_PATTERN_SYSTEM_INSTRUCTION,
  type WinPatternOutput,
} from '../prompts/win-pattern.js';
import { getArtifact, putArtifact } from './ai-artifacts.js';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
const TTL_SEC = 7 * 24 * 60 * 60; // 7 days
const TRANSCRIPT_EXCERPT_CHARS = 1200;
const MAX_CALLS = 60;
const MIN_FOR_INSIGHTS = 6;

interface CorpusRow {
  verdict: string;
  duration_seconds: number | null;
  industry: string | null;
  key_points: string | null;
  objections: string | null;
  transcript: string | null;
  status: string | null;
}

interface CorpusEntry {
  verdict: string;
  outcome: 'won' | 'lost' | 'pending';
  duration_seconds: number | null;
  industry: string | null;
  key_points: string[];
  objections: string[];
  transcript_excerpt: string;
}

function parseJsonArr(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function buildCorpus(): CorpusEntry[] {
  const rows = db
    .prepare(
      `SELECT c.verdict, c.duration_seconds, l.industry, l.status,
              c.key_points, c.objections, c.transcript
         FROM calls c
         LEFT JOIN leads l ON l.phone = c.phone
        WHERE c.status = 'analyzed' AND c.verdict IS NOT NULL
        ORDER BY c.created_at DESC
        LIMIT ?`
    )
    .all(MAX_CALLS) as CorpusRow[];

  return rows.map((r) => {
    const outcome: CorpusEntry['outcome'] =
      r.status === 'won' ? 'won' : r.status === 'lost' ? 'lost' : 'pending';
    return {
      verdict: r.verdict,
      outcome,
      duration_seconds: r.duration_seconds,
      industry: r.industry,
      key_points: parseJsonArr(r.key_points),
      objections: parseJsonArr(r.objections),
      transcript_excerpt: (r.transcript ?? '').slice(0, TRANSCRIPT_EXCERPT_CHARS),
    };
  });
}

function validate(raw: unknown): WinPatternOutput {
  const r = (raw as Record<string, unknown>) ?? {};
  const asStrings = (x: unknown): string[] =>
    Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [];
  const asIndustries = (x: unknown, rateKey: 'win_rate' | 'loss_rate') => {
    if (!Array.isArray(x)) return [];
    return x
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const o = row as Record<string, unknown>;
        const name = typeof o.name === 'string' ? o.name.trim() : '';
        const rate = Number(o[rateKey]);
        if (!name || !Number.isFinite(rate)) return null;
        return rateKey === 'win_rate'
          ? { name, win_rate: rate }
          : { name, loss_rate: rate };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null) as Array<
      { name: string; win_rate: number } | { name: string; loss_rate: number }
    >;
  };
  return {
    duration_insight:
      typeof r.duration_insight === 'string' ? r.duration_insight.trim() : '',
    language_patterns: asStrings(r.language_patterns).slice(0, 5),
    industries_strong: asIndustries(r.industries_strong, 'win_rate') as Array<{
      name: string;
      win_rate: number;
    }>,
    industries_weak: asIndustries(r.industries_weak, 'loss_rate') as Array<{
      name: string;
      loss_rate: number;
    }>,
    recommendations: asStrings(r.recommendations).slice(0, 7),
  };
}

export interface WinPatternResult {
  output: WinPatternOutput;
  corpus_size: number;
  enough_data: boolean;
  generated_at: number;
}

export async function getOrGenerateWinPattern(
  opts: { force?: boolean } = {}
): Promise<WinPatternResult> {
  if (!opts.force) {
    const cached = getArtifact<WinPatternResult>('win_pattern', 'global');
    if (cached) return cached.content;
  }

  const corpus = buildCorpus();
  const enough = corpus.length >= MIN_FOR_INSIGHTS;

  if (!enough) {
    const empty: WinPatternResult = {
      output: {
        duration_insight: '',
        language_patterns: [],
        industries_strong: [],
        industries_weak: [],
        recommendations: [
          `Need at least ${MIN_FOR_INSIGHTS} analyzed calls before patterns are reliable. You have ${corpus.length}.`,
        ],
      },
      corpus_size: corpus.length,
      enough_data: false,
      generated_at: Date.now(),
    };
    putArtifact('win_pattern', 'global', empty, TTL_SEC);
    return empty;
  }

  const response = await ai.models.generateContent({
    model: config.gemini.model,
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(corpus, null, 2) }] }],
    config: {
      systemInstruction: WIN_PATTERN_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: WIN_PATTERN_RESPONSE_SCHEMA,
      temperature: 0.3,
    },
  });

  const text = response.text;
  if (!text) throw new Error('win-pattern: empty response');
  const output = validate(JSON.parse(text));
  const result: WinPatternResult = {
    output,
    corpus_size: corpus.length,
    enough_data: true,
    generated_at: Date.now(),
  };
  putArtifact('win_pattern', 'global', result, TTL_SEC);
  return result;
}
