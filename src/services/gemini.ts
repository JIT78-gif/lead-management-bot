import { Type, type Schema } from '@google/genai';
import { SYSTEM_INSTRUCTION } from '../prompts/system.js';
import type { LeadData, MessageRow, TeamSize } from './leads.js';
import { callJsonModel, type LLMTurn } from './llm.js';
import type { CountryInfo } from './country-detect.js';
import type { Niche } from './niche-detect.js';

export interface RoutingContext {
  country: CountryInfo;
  niche: Niche;
}

export type BotAction = 'ASK_NEXT' | 'DISQUALIFY' | 'QUALIFY_AND_SAVE';

export interface BotTurn {
  reply: string;
  action: BotAction;
  data: LeadData;
}

const RESPONSE_SCHEMA: Schema = {
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
        // Phase 7 — populated by the niche-specific question (step 5b)
        // and the Google-Meet time question (international close).
        niche_detail: { type: Type.STRING, nullable: true },
        meet_preferred_time: { type: Type.STRING, nullable: true },
      },
      required: [
        'name',
        'industry',
        'team_size',
        'website_url',
        'social_handle',
        'niche_detail',
        'meet_preferred_time',
      ],
    },
  },
  required: ['reply', 'action', 'data'],
};

function historyToContents(
  history: MessageRow[],
  whatsappName: string | null,
  currentState: string,
  routing: RoutingContext | null,
  forceFreshGreeting: boolean
): LLMTurn[] {
  const contents: LLMTurn[] = [];

  // Count how many bot replies are in the history so the model knows
  // whether this is its FIRST turn (must greet) or a later turn (already
  // greeted, advance the flow). When forceFreshGreeting is true (Phase 9
  // soft-reset), we override and tell Gemini to greet again as if fresh
  // — even though history shows prior bot replies, the customer just
  // restarted with "hi" after a long gap.
  const botRepliesSoFar = history.filter((m) => m.direction === 'out').length;
  const isFirstReply = botRepliesSoFar === 0 || forceFreshGreeting;

  const flowHint = isFirstReply
    ? (forceFreshGreeting
        ? 'THE CUSTOMER JUST RESTARTED THE CONVERSATION with a fresh ' +
          'greeting after a long gap. Treat this as your first reply — ' +
          'send the step-1 greeting verbatim. Set ALL data fields to null. ' +
          'Ignore any prior bot messages in history; they were from a ' +
          'previous session.'
        : 'THIS IS YOUR FIRST REPLY IN THE CONVERSATION. ' +
          'You MUST reply with the step-1 greeting verbatim. ' +
          'Set ALL data fields to null. Do NOT skip ahead. Do NOT infer ' +
          'industry, name, or anything else from the customer\'s first message.')
    : `You have already sent ${botRepliesSoFar} reply/replies in this ` +
      'conversation. READ THE CUSTOMER\'S LATEST MESSAGE CAREFULLY ' +
      'before deciding what to do (see "READ THE CUSTOMER\'S LATEST ' +
      'MESSAGE FIRST" section of the system prompt). Do NOT blindly ' +
      'march to the next field. Do NOT say "Got it" / "Great" / ' +
      '"Perfect" if the customer didn\'t actually give you anything ' +
      'to acknowledge.';

  // Phase 7 routing hint — the bot reads these to pick the right
  // niche-specific extra question (step 5b) and the right close (phone
  // call vs Google Meet).
  //
  // is_india is the DISPOSITIVE flag for the close. Put it first so the
  // model anchors on it. Add an explicit "use the Meet close" note when
  // is_india=false so the model doesn't get confused by country_code=IN
  // alongside is_india=false (which happens during TEST_INTERNATIONAL_PHONES
  // overrides — phone is +91 but we want the international flow).
  const closeBranch = routing && routing.country.isIndia === false
    ? 'USE_GOOGLE_MEET_CLOSE (step 7B)'
    : 'USE_PHONE_CALL_CLOSE (step 7A)';
  const routingHint = routing
    ? `is_india=${routing.country.isIndia}, close_branch=${closeBranch}, country_code=${routing.country.code}, country_name=${routing.country.name}, niche=${routing.niche}`
    : `is_india=false, close_branch=${closeBranch}, country_code=XX, niche=other`;

  const meta = `[meta: whatsapp_profile_name=${whatsappName ?? 'unknown'}, conversation_state=${currentState}, bot_replies_sent=${botRepliesSoFar}, ${routingHint}]\n${flowHint}`;

  for (const m of history) {
    contents.push({
      role: m.direction === 'in' ? 'user' : 'model',
      text: m.text,
    });
  }

  // Append the meta hint to the last user message (or start a new one) so
  // the model sees it but the customer never does.
  if (contents.length > 0 && contents[contents.length - 1]!.role === 'user') {
    const last = contents[contents.length - 1]!;
    last.text = `${last.text}\n${meta}`;
  } else {
    contents.push({ role: 'user', text: meta });
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
    niche_detail: cleanString(d.niche_detail),
    meet_preferred_time: cleanString(d.meet_preferred_time),
  };

  return { reply, action, data };
}

async function callOnce(
  contents: LLMTurn[],
  log?: { warn?: (...a: unknown[]) => void; info?: (...a: unknown[]) => void }
): Promise<BotTurn> {
  const { text } = await callJsonModel(
    {
      systemInstruction: SYSTEM_INSTRUCTION,
      contents,
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.4,
    },
    log
  );
  return validate(JSON.parse(text));
}

/**
 * Run one bot turn. Tries direct Gemini first; falls back to OpenRouter on
 * billing / auth / quota / 5xx / transient errors. Retries once on
 * everything else. Throws after both providers AND a retry have failed.
 */
export async function runTurn(
  history: MessageRow[],
  whatsappName: string | null,
  currentState: string,
  log?: { warn?: (...a: unknown[]) => void; info?: (...a: unknown[]) => void },
  routing: RoutingContext | null = null,
  options: { forceFreshGreeting?: boolean } = {}
): Promise<BotTurn> {
  const forceFreshGreeting = options.forceFreshGreeting ?? false;
  const contents = historyToContents(history, whatsappName, currentState, routing, forceFreshGreeting);
  try {
    return await callOnce(contents, log);
  } catch (err) {
    // One retry on residual flakes (the fallback inside callJsonModel
    // already handled the structural failures; this catches transient
    // network / JSON parse hiccups).
    return await callOnce(contents, log);
  }
}
