import { readFile, stat } from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { RESPONSE_SCHEMA, SYSTEM_INSTRUCTION } from '../prompts/call-analysis.js';
import { resolveAudioPath } from './audio-storage.js';
import type {
  AnalysisResult,
  CallVerdict,
} from './calls.js';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

// Below this size we send the audio inline as base64. Above, we use the
// Files API. Base64 inflates by ~33% and Gemini caps inline requests around
// 20 MB, so 10 MB raw is a safe ceiling.
const INLINE_BYTES_LIMIT = 10 * 1024 * 1024;

const VERDICTS: ReadonlySet<CallVerdict> = new Set<CallVerdict>([
  'hot',
  'warm',
  'cold',
  'not_interested',
]);

function validate(raw: unknown): AnalysisResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('analysis: non-object response');
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.transcript !== 'string') throw new Error('analysis: missing transcript');
  if (typeof r.verdict_reasoning !== 'string') throw new Error('analysis: missing verdict_reasoning');
  if (!VERDICTS.has(r.verdict as CallVerdict)) {
    throw new Error(`analysis: invalid verdict "${String(r.verdict)}"`);
  }

  const conf = Number(r.verdict_confidence);
  if (!Number.isFinite(conf) || conf < 0 || conf > 1) {
    throw new Error('analysis: invalid verdict_confidence');
  }

  const asStringArray = (x: unknown): string[] =>
    Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [];

  return {
    transcript: r.transcript.trim(),
    summary: asStringArray(r.summary),
    verdict: r.verdict as CallVerdict,
    verdict_confidence: conf,
    verdict_reasoning: r.verdict_reasoning.trim(),
    key_points: asStringArray(r.key_points),
    objections: asStringArray(r.objections),
    action_items: asStringArray(r.action_items),
  };
}

async function callInline(
  audioBuf: Buffer,
  mimeType: string
): Promise<AnalysisResult> {
  const response = await ai.models.generateContent({
    model: config.gemini.model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: audioBuf.toString('base64'),
            },
          },
          {
            text: 'Analyze this sales call. Return JSON matching the supplied schema.',
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) throw new Error('analysis: empty response from Gemini');
  return validate(JSON.parse(text));
}

async function callViaFilesApi(
  audioPath: string,
  mimeType: string
): Promise<AnalysisResult> {
  // Upload the audio to Gemini Files API
  let file = await ai.files.upload({
    file: audioPath,
    config: { mimeType },
  });

  // Wait for the file to be ACTIVE (Gemini processes large audio first)
  const start = Date.now();
  while (file.state === 'PROCESSING') {
    if (Date.now() - start > 120_000) {
      throw new Error('analysis: file processing timeout');
    }
    await new Promise((res) => setTimeout(res, 2_000));
    file = await ai.files.get({ name: file.name! });
  }
  if (file.state !== 'ACTIVE') {
    throw new Error(`analysis: file state ${file.state}`);
  }

  const response = await ai.models.generateContent({
    model: config.gemini.model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            fileData: {
              fileUri: file.uri!,
              mimeType: file.mimeType ?? mimeType,
            },
          },
          {
            text: 'Analyze this sales call. Return JSON matching the supplied schema.',
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  const text = response.text;
  if (!text) throw new Error('analysis: empty response from Gemini');
  return validate(JSON.parse(text));
}

/**
 * Analyze a saved call recording. Picks inline or Files API based on size.
 * Throws on failure — caller (the route handler) catches and marks the
 * `calls` row as `status='failed'` with the error message.
 */
export async function analyzeCall(
  audioRelativePath: string,
  mimeType: string
): Promise<AnalysisResult> {
  const absolutePath = resolveAudioPath(audioRelativePath);
  const { size } = await stat(absolutePath);

  if (size <= INLINE_BYTES_LIMIT) {
    const buf = await readFile(absolutePath);
    return callInline(buf, mimeType);
  }

  return callViaFilesApi(absolutePath, mimeType);
}
