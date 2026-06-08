/**
 * Frontend helpers for displaying the Phase 7 country / niche fields.
 * Server already detected and stored them; we only render here.
 */

const COUNTRY_TABLE: Record<string, { name: string; flag: string }> = {
  IN: { name: 'India',         flag: '🇮🇳' },
  AE: { name: 'UAE',           flag: '🇦🇪' },
  SA: { name: 'Saudi Arabia',  flag: '🇸🇦' },
  QA: { name: 'Qatar',         flag: '🇶🇦' },
  OM: { name: 'Oman',          flag: '🇴🇲' },
  KW: { name: 'Kuwait',        flag: '🇰🇼' },
  BH: { name: 'Bahrain',       flag: '🇧🇭' },
  GB: { name: 'United Kingdom',flag: '🇬🇧' },
  IE: { name: 'Ireland',       flag: '🇮🇪' },
  AU: { name: 'Australia',     flag: '🇦🇺' },
  NZ: { name: 'New Zealand',   flag: '🇳🇿' },
  SG: { name: 'Singapore',     flag: '🇸🇬' },
  MY: { name: 'Malaysia',      flag: '🇲🇾' },
  PH: { name: 'Philippines',   flag: '🇵🇭' },
  PK: { name: 'Pakistan',      flag: '🇵🇰' },
  BD: { name: 'Bangladesh',    flag: '🇧🇩' },
  LK: { name: 'Sri Lanka',     flag: '🇱🇰' },
  NA: { name: 'US / Canada',   flag: '🇺🇸' },
};

const UNKNOWN = { name: 'Unknown', flag: '🌐' };

export function countryInfo(code: string | null | undefined): {
  name: string;
  flag: string;
} {
  if (!code) return UNKNOWN;
  return COUNTRY_TABLE[code] ?? UNKNOWN;
}

export const NICHES = [
  'real_estate',
  'healthcare',
  'restaurant',
  'education',
  'visa_tourism',
  'other',
] as const;

export type Niche = (typeof NICHES)[number];

export function nicheLabel(niche: string | null | undefined): string | null {
  switch (niche) {
    case 'real_estate':  return 'Real Estate';
    case 'healthcare':   return 'Healthcare';
    case 'restaurant':   return 'Restaurant';
    case 'education':    return 'Education';
    case 'visa_tourism': return 'Visa & Tourism';
    default:             return null; // 'other' or null → don't show a pill
  }
}
