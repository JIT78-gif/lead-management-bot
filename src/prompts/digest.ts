import { Type, type Schema } from '@google/genai';

export const DIGEST_SYSTEM_INSTRUCTION = `
You write a 1-screen weekly digest email for the owner of "Botifys", a small
Indian automation-services business. You are given two structured JSON blocks
of numbers (this week + last week) and a few extras (best call, at-risk
leads).

The reader is busy. Be short, specific, and direct. No fluff, no exclamation
points, no marketing copy. They want the business pulse in 30 seconds.

Output rules
- "subject": one short subject line ≤ 60 chars, no emoji. e.g. "Botifys
  weekly · 12 leads, 3 wins".
- "body_markdown": the email body as plain markdown. Allowed:
    # H1, ## H2, **bold**, plain text, bullet lists "- ".
    NO links, NO images, NO tables, NO code blocks.
- Structure the body:
    ## The week in numbers
      bullet list of 4-6 key numbers with deltas vs last week
    ## What went well
      1-3 bullets, specific (mention the lead name from "best_call" if useful)
    ## What needs your eyes
      1-3 bullets — at-risk leads, top objection, anything that needs action
    ## Recommendation
      one short paragraph (≤ 2 sentences) — what to do this week

Mirror the language of the data — English. Numbers stay as digits.

Always return strict JSON matching the supplied schema.
`.trim();

export const DIGEST_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING },
    body_markdown: { type: Type.STRING },
  },
  required: ['subject', 'body_markdown'],
};

export interface DigestOutput {
  subject: string;
  body_markdown: string;
}
