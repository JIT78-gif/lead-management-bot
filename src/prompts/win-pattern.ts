import { Type, type Schema } from '@google/genai';

export const WIN_PATTERN_SYSTEM_INSTRUCTION = `
You analyse a corpus of sales-call data for "Botifys", an Indian
automation-services business, and surface what is DIFFERENT about the calls
that converted (won) versus the ones that did not (lost / not-interested).

You receive an array of call records, each with: verdict, duration_seconds,
industry, key_points, objections, and a short transcript excerpt.

Your job: find PATTERNS, not anecdotes. Only state something if it is true
across the data, not just in one call.

Output rules
- "duration_insight": one sentence comparing average won-call duration vs
  lost-call duration. Use the numbers in the data. If the gap is < 20%, say
  "duration does not strongly differ" rather than inventing a story.
- "language_patterns": up to 3 short phrases or topics that appear noticeably
  more often in WON calls than LOST ones. Quote them as the salesperson or
  customer would say them. Empty array if no clear pattern.
- "industries_strong": up to 3 industries with the highest win rate, each
  with "name" and "win_rate" (0..1). Skip industries with fewer than 2 calls.
- "industries_weak": up to 3 industries with the highest loss/no-interest
  rate, same shape but "loss_rate" instead.
- "recommendations": 3-5 specific actions the owner can take based on the
  patterns above. Each one short and concrete (e.g. "Push for an in-person
  demo earlier — wins average 22 min, losses 9 min").

Never invent data. If the corpus is too small (< 6 calls with clear verdicts),
return empty arrays for the patterns and a single recommendation: "Need more
analyzed calls before patterns are reliable."

Always return strict JSON matching the supplied schema.
`.trim();

export const WIN_PATTERN_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    duration_insight: { type: Type.STRING },
    language_patterns: { type: Type.ARRAY, items: { type: Type.STRING } },
    industries_strong: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          win_rate: { type: Type.NUMBER },
        },
        required: ['name', 'win_rate'],
      },
    },
    industries_weak: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          loss_rate: { type: Type.NUMBER },
        },
        required: ['name', 'loss_rate'],
      },
    },
    recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'duration_insight',
    'language_patterns',
    'industries_strong',
    'industries_weak',
    'recommendations',
  ],
};

export interface WinPatternOutput {
  duration_insight: string;
  language_patterns: string[];
  industries_strong: Array<{ name: string; win_rate: number }>;
  industries_weak: Array<{ name: string; loss_rate: number }>;
  recommendations: string[];
}
