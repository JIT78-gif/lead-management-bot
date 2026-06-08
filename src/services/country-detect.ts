/**
 * Map a WhatsApp phone number (digits only, no leading "+") to a country.
 * The bot uses this for routing decisions:
 *   - Indian numbers → phone-call close.
 *   - Everyone else → Google Meet close.
 *
 * Pure function. Add new entries here as you expand into more markets.
 * Longest-prefix-match so 971 (UAE) beats 91 (India) etc.
 */

export interface CountryInfo {
  /** ISO 3166-1 alpha-2. NA = ambiguous +1 (US or Canada). */
  code: string;
  /** Display name for the dashboard / salesperson notification. */
  name: string;
  /** Regional-indicator flag emoji. */
  flag: string;
  /** Convenience boolean — drives the call-vs-meet branch in the prompt. */
  isIndia: boolean;
  /**
   * IANA timezone used as the default when parsing the customer's
   * natural-language Meet time AND when formatting confirmations back
   * to them. For multi-timezone countries (US, AU, CA) this is a
   * sensible-default city; the customer can override by naming a
   * different timezone in their message ("Wed 10am AEST").
   */
  timezone: string;
}

const UNKNOWN: CountryInfo = {
  code: 'XX',
  name: 'Unknown',
  flag: '🌐',
  isIndia: false,
  timezone: 'UTC',
};

// Ordered longest-prefix-first so the .find() below picks the most
// specific match. e.g. 974 (Qatar) must come before any shorter prefix
// it would otherwise collide with.
const TABLE: Array<{ prefix: string; info: CountryInfo }> = [
  // Gulf
  { prefix: '971', info: { code: 'AE', name: 'UAE',          flag: '🇦🇪', isIndia: false, timezone: 'Asia/Dubai'  } },
  { prefix: '966', info: { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', isIndia: false, timezone: 'Asia/Riyadh' } },
  { prefix: '974', info: { code: 'QA', name: 'Qatar',        flag: '🇶🇦', isIndia: false, timezone: 'Asia/Qatar'  } },
  { prefix: '968', info: { code: 'OM', name: 'Oman',         flag: '🇴🇲', isIndia: false, timezone: 'Asia/Muscat' } },
  { prefix: '965', info: { code: 'KW', name: 'Kuwait',       flag: '🇰🇼', isIndia: false, timezone: 'Asia/Kuwait' } },
  { prefix: '973', info: { code: 'BH', name: 'Bahrain',      flag: '🇧🇭', isIndia: false, timezone: 'Asia/Bahrain'} },

  // Europe / commonwealth
  { prefix: '44',  info: { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', isIndia: false, timezone: 'Europe/London' } },
  { prefix: '353', info: { code: 'IE', name: 'Ireland',        flag: '🇮🇪', isIndia: false, timezone: 'Europe/Dublin' } },

  // Asia-Pacific (multi-TZ countries default to the most populous city)
  { prefix: '61',  info: { code: 'AU', name: 'Australia',  flag: '🇦🇺', isIndia: false, timezone: 'Australia/Sydney'    } },
  { prefix: '64',  info: { code: 'NZ', name: 'New Zealand',flag: '🇳🇿', isIndia: false, timezone: 'Pacific/Auckland'    } },
  { prefix: '65',  info: { code: 'SG', name: 'Singapore',  flag: '🇸🇬', isIndia: false, timezone: 'Asia/Singapore'      } },
  { prefix: '60',  info: { code: 'MY', name: 'Malaysia',   flag: '🇲🇾', isIndia: false, timezone: 'Asia/Kuala_Lumpur'   } },
  { prefix: '63',  info: { code: 'PH', name: 'Philippines',flag: '🇵🇭', isIndia: false, timezone: 'Asia/Manila'         } },
  { prefix: '92',  info: { code: 'PK', name: 'Pakistan',   flag: '🇵🇰', isIndia: false, timezone: 'Asia/Karachi'        } },
  { prefix: '880', info: { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', isIndia: false, timezone: 'Asia/Dhaka'          } },
  { prefix: '94',  info: { code: 'LK', name: 'Sri Lanka',  flag: '🇱🇰', isIndia: false, timezone: 'Asia/Colombo'        } },

  // North America — +1 is shared by US and Canada. Eastern Time is the
  // most populous default; customer can override by naming their TZ.
  { prefix: '1',   info: { code: 'NA', name: 'US / Canada', flag: '🇺🇸', isIndia: false, timezone: 'America/New_York' } },

  // India must come LAST so longer prefixes match first; 91 vs e.g. 92
  // is fine since they're different leading digits, but keep the rule.
  { prefix: '91',  info: { code: 'IN', name: 'India', flag: '🇮🇳', isIndia: true, timezone: 'Asia/Kolkata' } },
];

// Pre-sort by prefix length desc, so longest-prefix wins regardless of
// how the table is authored above.
const TABLE_SORTED = [...TABLE].sort(
  (a, b) => b.prefix.length - a.prefix.length
);

export function detectCountry(phone: string | null | undefined): CountryInfo {
  if (!phone) return UNKNOWN;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return UNKNOWN;

  const match = TABLE_SORTED.find((row) => digits.startsWith(row.prefix));
  return match ? match.info : UNKNOWN;
}
