import { GoogleGenAI, type Schema, type Content } from '@google/genai';
import { config } from '../config.js';

const ai = config.gemini.apiKey
  ? new GoogleGenAI({ apiKey: config.gemini.apiKey })
  : null;

/**
 * Unified text-generation entrypoint with provider fallback.
 *
 * Primary: direct Gemini API (cheapest, lowest latency when it works).
 * Fallback: OpenRouter routing to the same Gemini family (paid via OR
 * credits — keeps the bot alive when Google Cloud has blocked the project
 * for billing, exhausted quota, revoked the key, or is having an outage).
 *
 * If OPENROUTER_API_KEY is not set, only the direct provider is used and
 * its errors propagate as before.
 *
 * Callers pass a system instruction + history + JSON schema and get back
 * the model's raw JSON text — exactly the same contract as before, just
 * with automatic failover under the hood.
 */

export type LLMRole = 'user' | 'model';

export interface LLMTurn {
  role: LLMRole;
  text: string;
}

export interface CallJsonModelParams {
  systemInstruction: string;
  contents: LLMTurn[];
  responseSchema: Schema;
  temperature?: number;
}

export interface CallJsonModelResult {
  /** Raw JSON text from the model — caller JSON.parses it. */
  text: string;
  /** Which provider actually returned the value. Useful for logging. */
  provider: 'gemini' | 'openrouter';
}

/**
 * Returns true when an error from the direct Gemini call is the kind that
 * a different provider could plausibly recover. Things like "your prompt is
 * malformed" are not recoverable and should propagate.
 */
function isRecoverableProviderError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? `${err.message}`
      : typeof err === 'string'
        ? err
        : JSON.stringify(err);
  const lower = msg.toLowerCase();

  // Billing / auth / quota — exactly the cases the user just hit.
  if (lower.includes('lightning dunning')) return true;
  if (lower.includes('permission_denied')) return true;
  if (lower.includes('unauthenticated')) return true;
  if (lower.includes('api key not valid')) return true;
  if (lower.includes('api_key_invalid')) return true;
  if (lower.includes('resource_exhausted')) return true;
  if (lower.includes('quota')) return true;

  // HTTP status hints in the error text.
  if (/\b(401|403|429|500|502|503|504)\b/.test(msg)) return true;

  // Network / transient.
  if (lower.includes('fetch failed')) return true;
  if (lower.includes('timeout')) return true;
  if (lower.includes('econnreset')) return true;
  if (lower.includes('enotfound')) return true;

  // Bad JSON from the model — different provider might do better.
  if (lower.includes('non-object response')) return true;
  if (lower.includes('empty response')) return true;
  if (lower.includes('json')) return true;

  return false;
}

export async function callJsonModel(
  params: CallJsonModelParams,
  log?: { warn?: (...a: unknown[]) => void; info?: (...a: unknown[]) => void }
): Promise<CallJsonModelResult> {
  const hasGemini = ai !== null;
  const hasOpenRouter = config.openrouter.apiKey !== '';

  // Single-provider modes — no fallback chain.
  if (!hasGemini && hasOpenRouter) {
    const text = await callOpenRouter(params);
    return { text, provider: 'openrouter' };
  }
  if (hasGemini && !hasOpenRouter) {
    const text = await callGeminiDirect(params);
    return { text, provider: 'gemini' };
  }

  // Both configured — try Gemini first, fall back to OpenRouter on
  // recoverable failures (billing, auth, quota, transient).
  try {
    const text = await callGeminiDirect(params);
    return { text, provider: 'gemini' };
  } catch (geminiErr) {
    if (!isRecoverableProviderError(geminiErr)) throw geminiErr;

    log?.warn?.(
      {
        err: geminiErr instanceof Error ? geminiErr.message : String(geminiErr),
      },
      'Gemini direct call failed; trying OpenRouter fallback'
    );

    try {
      const text = await callOpenRouter(params);
      log?.info?.({ provider: 'openrouter' }, 'OpenRouter fallback succeeded');
      return { text, provider: 'openrouter' };
    } catch (orErr) {
      log?.warn?.(
        { err: orErr instanceof Error ? orErr.message : String(orErr) },
        'OpenRouter fallback also failed'
      );
      throw new Error(
        `Both providers failed. Gemini: ${
          geminiErr instanceof Error ? geminiErr.message : String(geminiErr)
        } | OpenRouter: ${
          orErr instanceof Error ? orErr.message : String(orErr)
        }`
      );
    }
  }
}

// ─── Provider 1: direct Gemini ────────────────────────────────────────────

async function callGeminiDirect(params: CallJsonModelParams): Promise<string> {
  if (!ai) throw new Error('Gemini client not configured');
  const contents: Content[] = params.contents.map((t) => ({
    role: t.role,
    parts: [{ text: t.text }],
  }));

  const response = await ai.models.generateContent({
    model: config.gemini.model,
    contents,
    config: {
      systemInstruction: params.systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: params.responseSchema,
      temperature: params.temperature ?? 0.4,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Gemini: empty response text');
  return text;
}

// ─── Provider 2: OpenRouter (OpenAI-compatible) ───────────────────────────

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string; code?: number | string };
}

async function callOpenRouter(params: CallJsonModelParams): Promise<string> {
  const messages: OpenRouterMessage[] = [
    { role: 'system', content: params.systemInstruction },
    ...params.contents.map<OpenRouterMessage>((t) => ({
      role: t.role === 'model' ? 'assistant' : 'user',
      content: t.text,
    })),
  ];

  const body = {
    model: config.openrouter.model,
    messages,
    temperature: params.temperature ?? 0.4,
    response_format: {
      type: 'json_schema' as const,
      json_schema: {
        name: 'bot_response',
        strict: true,
        schema: geminiSchemaToJsonSchema(params.responseSchema),
      },
    },
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openrouter.apiKey}`,
      'Content-Type': 'application/json',
      // Attribution headers — OpenRouter uses these for ranking listings.
      'HTTP-Referer': config.openrouter.appUrl,
      'X-Title': config.openrouter.appName,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '<no body>');
    throw new Error(`OpenRouter HTTP ${res.status}: ${errBody}`);
  }

  const json = (await res.json()) as OpenRouterResponse;
  if (json.error) {
    throw new Error(
      `OpenRouter error: ${json.error.message ?? JSON.stringify(json.error)}`
    );
  }

  const text = json.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error('OpenRouter: empty response content');
  }
  return text;
}

// ─── Schema translation ───────────────────────────────────────────────────

/**
 * Convert a Gemini-style Schema (uppercase `type: "OBJECT"`, etc.) into a
 * JSON Schema document (lowercase `type: "object"`) that OpenAI-compatible
 * APIs accept. Recurses into properties and items.
 */
function geminiSchemaToJsonSchema(s: unknown): unknown {
  if (!s || typeof s !== 'object') return s;
  if (Array.isArray(s)) return s.map(geminiSchemaToJsonSchema);

  const src = s as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(src)) {
    if (k === 'type' && typeof v === 'string') {
      out.type = v.toLowerCase();
    } else if (k === 'properties' && v && typeof v === 'object') {
      const p: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        p[pk] = geminiSchemaToJsonSchema(pv);
      }
      out.properties = p;
    } else if (k === 'items') {
      out.items = geminiSchemaToJsonSchema(v);
    } else if (k === 'nullable' && v === true) {
      // OpenAI strict json_schema doesn't have a "nullable" key; expand to
      // a union "type" array. e.g. {type: 'string', nullable: true} →
      // {type: ['string', 'null']}.
      const existingType = out.type;
      if (typeof existingType === 'string') {
        out.type = [existingType, 'null'];
      } else if (Array.isArray(existingType) && !existingType.includes('null')) {
        out.type = [...existingType, 'null'];
      }
      // intentionally drop 'nullable' itself
    } else {
      out[k] = v;
    }
  }

  // OpenAI strict mode requires `additionalProperties: false` on every
  // object schema. Add it if not present.
  if (out.type === 'object' && !('additionalProperties' in out)) {
    out.additionalProperties = false;
  }

  // OpenAI strict mode requires every property to appear in `required`.
  if (
    out.type === 'object' &&
    out.properties &&
    typeof out.properties === 'object' &&
    !('required' in out)
  ) {
    out.required = Object.keys(out.properties as Record<string, unknown>);
  }

  return out;
}
