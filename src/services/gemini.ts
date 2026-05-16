import { GoogleGenAI, Type } from '@google/genai';
import type { Content } from '@google/genai';
import { config } from '../config.js';
import { SYSTEM_INSTRUCTION } from '../prompts/system.js';
import type { LeadData, MessageRow, TeamSize } from './leads.js';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

export type BotAction = 'ASK_NEXT' | 'DISQUALIFY' | 'QUALIFY_AND_SAVE';

export interface BotTurn {
  reply: string;
  action: BotAction;
  data: LeadData;
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    action: {
      type: Type.STRING,
      enum: ['ASK_NEXT', 'DISQUALIFY', 'QUALIFY_AND_SAVE'],
    },
    data: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, nullable: true },
        industry: { type: Type.STRING, nullable: true },
        team_size: {
          type: Type.STRING,
          enum: ['solo', '2-5', '6-10', '11-25', '25+'],
          nullable: true,
        },
        website_url: { type: Type.STRING, nullable: true },
        social_handle: { type: Type.STRING, nullable: true },
      },
      required: ['name', 'industry', 'team_size', 'website_url', 'social_handle'],
    },
  },
  required: ['reply', 'action', 'data'],
};

function historyToContents(
  history: MessageRow[],
  whatsappName: string | null,
  currentState: string
): Content[] {
  const contents: Content[] = [];

  const meta = `[meta: whatsapp_profile_name=${whatsappName ?? 'unknown'}, conversation_state=${currentState}]`;

  for (const m of history) {
    contents.push({
      role: m.direction === 'in' ? 'user' : 'model',
      parts: [{ text: m.text }],
    });
  }

  // Inject the meta hint as the final user-side note before Gemini answers.
  // This nudges Gemini to use the profile name and remember the state without
  // polluting the actual customer-visible transcript.
  if (contents.length > 0 && contents[contents.length - 1]!.role === 'user') {
    const last = contents[contents.length - 1]!;
    last.parts = [...(last.parts ?? []), { text: meta }];
  } else {
    contents.push({ role: 'user', parts: [{ text: meta }] });
  }

  return contents;
}

const TEAM_SIZE_VALUES: ReadonlySet<TeamSize> = new Set<TeamSize>([
  'solo',
  '2-5',
  '6-10',
  '11-25',
  '25+',
]);

/**
 * Decode stray escape sequences that occasionally appear as literal text
 * in Gemini's JSON string fields. The model sometimes writes "—"
 * (six characters) instead of an em dash and "\n" (two characters)
 * instead of an actual newline. JSON.parse can't fix this because the
 * sequences were already string content by the time the wire JSON was
 * valid. Without this, customers see "—" verbatim in their chat.
 */
function decodeStrayEscapes(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '');
}

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const cleaned = decodeStrayEscapes(v).trim();
  return cleaned === '' ? null : cleaned;
}

function validate(raw: unknown): BotTurn {
  if (!raw || typeof raw !== 'object') throw new Error('Gemini: non-object response');
  const r = raw as Record<string, unknown>;

  const reply = typeof r.reply === 'string' ? decodeStrayEscapes(r.reply) : '';
  if (
    r.action !== 'ASK_NEXT' &&
    r.action !== 'DISQUALIFY' &&
    r.action !== 'QUALIFY_AND_SAVE'
  ) {
    throw new Error(`Gemini: invalid action "${String(r.action)}"`);
  }
  const action = r.action as BotAction;

  const d = (r.data ?? {}) as Record<string, unknown>;
  const teamSizeRaw = d.team_size;
  const teamSize: TeamSize | null =
    typeof teamSizeRaw === 'string' && TEAM_SIZE_VALUES.has(teamSizeRaw as TeamSize)
      ? (teamSizeRaw as TeamSize)
      : null;

  const data: LeadData = {
    name: cleanString(d.name),
    industry: cleanString(d.industry),
    team_size: teamSize,
    website_url: cleanString(d.website_url),
    social_handle: cleanString(d.social_handle),
  };

  return { reply, action, data };
}

async function callOnce(contents: Content[]): Promise<BotTurn> {
  const response = await ai.models.generateContent({
    model: config.gemini.model,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.4,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Gemini: empty response text');
  return validate(JSON.parse(text));
}

/**
 * Run one bot turn. Calls Gemini with the full conversation history and a
 * single retry on failure.
 */
export async function runTurn(
  history: MessageRow[],
  whatsappName: string | null,
  currentState: string
): Promise<BotTurn> {
  const contents = historyToContents(history, whatsappName, currentState);
  try {
    return await callOnce(contents);
  } catch (err) {
    // Retry once on transient errors / malformed JSON.
    return await callOnce(contents);
  }
}
