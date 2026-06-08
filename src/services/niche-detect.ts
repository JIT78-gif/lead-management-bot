/**
 * Detect which Botifys campaign niche a customer is from, based on the
 * pre-filled ad message they sent as their first WhatsApp inbound.
 *
 * Each Meta ad campaign pre-fills its own opening message text (e.g. a
 * real-estate ad pre-fills "Hi, I want to automate my real estate
 * business"). We do a lowercase keyword match here on the server BEFORE
 * the LLM call — cheap, deterministic, and lets the bot ask
 * niche-specific qualifying questions without an extra reasoning round.
 *
 * Pure function. Add or tune keywords here; first match wins so the
 * order below matters only for genuine ambiguity (the keyword sets are
 * essentially disjoint in real campaigns).
 */

export type Niche =
  | 'real_estate'
  | 'healthcare'
  | 'restaurant'
  | 'education'
  | 'visa_tourism'
  | 'other';

export const ALL_NICHES: readonly Niche[] = [
  'real_estate',
  'healthcare',
  'restaurant',
  'education',
  'visa_tourism',
  'other',
] as const;

interface Rule {
  niche: Exclude<Niche, 'other'>;
  keywords: readonly string[];
}

// Keyword lists are lowercase. Match is substring-anywhere — keeps the
// rule simple and tolerant of customer phrasing variations.
const RULES: readonly Rule[] = [
  {
    niche: 'real_estate',
    keywords: [
      'real estate', 'realestate', 'realtor', 'realty',
      'property', 'properties', 'broker',
      'listing', 'listings', 'mls',
    ],
  },
  {
    niche: 'healthcare',
    keywords: [
      'clinic', 'hospital', 'doctor', 'doctors',
      'patient', 'patients', 'medical', 'medicine',
      'dental', 'dentist', 'pharmacy', 'pharmacist',
      'healthcare', 'health care',
    ],
  },
  {
    niche: 'restaurant',
    keywords: [
      'restaurant', 'restaurants',
      'cafe', 'café', 'coffee shop',
      'food', 'dining', 'kitchen',
      'eatery', 'bistro', 'bakery',
    ],
  },
  {
    niche: 'education',
    keywords: [
      'school', 'schools',
      'institute', 'institutes', 'institution',
      'coaching', 'tuition',
      'college', 'university',
      'education', 'edu-tech', 'edtech',
      'students',
    ],
  },
  {
    niche: 'visa_tourism',
    keywords: [
      'visa', 'visas',
      'immigration', 'immigrant',
      'tourism', 'tourist',
      'travel agency', 'travel agent',
      'study abroad', 'overseas',
    ],
  },
];

export function detectNiche(firstMessageText: string | null | undefined): Niche {
  if (!firstMessageText) return 'other';
  const lower = firstMessageText.toLowerCase();
  if (lower.trim() === '') return 'other';

  for (const rule of RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.niche;
    }
  }
  return 'other';
}

/** Human-readable label for the dashboard / notifications. */
export function nicheLabel(n: Niche): string {
  switch (n) {
    case 'real_estate': return 'Real Estate';
    case 'healthcare': return 'Healthcare';
    case 'restaurant': return 'Restaurant';
    case 'education': return 'Education';
    case 'visa_tourism': return 'Visa & Tourism';
    case 'other': return 'Other';
  }
}
