import { Type, type Schema } from '@google/genai';

export const PRECALL_BRIEF_SYSTEM_INSTRUCTION = `
You prepare a 30-second pre-call brief for a salesperson at "Botifys", an
Indian automation-services business. The salesperson is about to call a lead
they may have never spoken to before. Give them everything they need so they
do not have to re-read the WhatsApp conversation.

Inputs you will receive
- The lead's structured fields (name, industry, team_size, website/social).
- The full WhatsApp conversation between the bot and the lead.
- The latest sales-call analysis (if any).

Output rules
- "headline": one short sentence, ≤ 18 words. Says who this is and what they
  want. Direct, no buzzwords.
- "signals": exactly 3 buying signals from the conversation. Each grounded in
  a real moment ("they replied within seconds", "they asked specifically about
  Instagram DMs", "they mentioned a team of 4 — bigger than typical"). If you
  cannot find 3 real signals, return fewer — never invent.
- "objections_expected": up to 3 objections likely to come up on the call,
  based on the conversation tone and content. Empty array if none stand out.
- "opening_line": ONE suggested opening sentence the salesperson can actually
  say, in the same language the lead used (English / Hindi / Hinglish). Warm,
  specific, references something the lead said. Not generic.
- "do_not_say": 1–2 things to avoid based on the prior context (e.g. "don't
  ask their industry again — they already said bakery"). Empty array if none.

Language: mirror what the lead used in WhatsApp. If mixed, use Hinglish.

Always return strict JSON matching the supplied schema.
`.trim();

export const PRECALL_BRIEF_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING },
    signals: { type: Type.ARRAY, items: { type: Type.STRING } },
    objections_expected: { type: Type.ARRAY, items: { type: Type.STRING } },
    opening_line: { type: Type.STRING },
    do_not_say: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['headline', 'signals', 'objections_expected', 'opening_line', 'do_not_say'],
};

export interface PrecallBriefOutput {
  headline: string;
  signals: string[];
  objections_expected: string[];
  opening_line: string;
  do_not_say: string[];
}
