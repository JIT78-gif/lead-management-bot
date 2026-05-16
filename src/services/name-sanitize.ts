/**
 * Pick the best name to save for a qualified lead.
 *
 * The bot occasionally records junk in `data.name` because customers reply
 * with "yes", "ok", "automation", etc. when asked to confirm. The WhatsApp
 * profile name is far more reliable — it's set by the user themselves in
 * their WhatsApp account and almost always reflects their real name. This
 * helper enforces that preference at the server boundary so the
 * salesperson always has a sensible name to call them by.
 */

// Common one-word answers that aren't real names. Lower-case, trimmed.
const NOT_NAMES: ReadonlySet<string> = new Set([
  // affirmatives / negatives
  'yes', 'y', 'yeah', 'yup', 'yep', 'sure', 'ok', 'okay', 'k',
  'haan', 'haa', 'han', 'ji', 'hmm', 'hmmm', 'hm', 'ha',
  'no', 'n', 'nahi', 'nope', 'na',
  // greetings / fillers
  'hi', 'hello', 'hey', 'namaste', 'salam',
  'thanks', 'thank', 'thx', 'tq', 'done', 'cool', 'nice',
  // words customers sometimes type when prompted
  'automation', 'business', 'whatsapp', 'whatsapp user', 'user',
  'admin', 'owner', 'test', 'testing', 'sample',
  'maybe', 'whatever', 'idk', 'tbh',
]);

const DEVANAGARI_RANGE = /[ऀ-ॿ]/;
const LETTER = /[a-zA-Zऀ-ॿ]/;

/**
 * Returns true when `s` looks like a real person's name.
 * Has letters, more than one character, not in the not-a-name blocklist,
 * not predominantly digits, not the literal "whatsapp user" placeholder.
 */
export function looksLikeRealName(s: string | null | undefined): boolean {
  if (!s) return false;
  const trimmed = s.trim();
  if (trimmed.length < 2) return false;

  const lower = trimmed.toLowerCase();
  if (NOT_NAMES.has(lower)) return false;

  // Must contain at least one letter (Latin or Devanagari for Hindi names).
  if (!LETTER.test(trimmed)) return false;

  // Strip non-letters and require at least 2 letters total — keeps out
  // things like "K." or "1A".
  const lettersOnly = trimmed.replace(/[^a-zA-Zऀ-ॿ]/g, '');
  if (lettersOnly.length < 2) return false;

  // Predominantly digits → not a name (e.g. "9876543210", "user 1234").
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (digits.length > lettersOnly.length) return false;

  return true;
}

/**
 * Decide which name to save:
 *   1. The extracted name from Gemini, if it looks real.
 *   2. Otherwise the WhatsApp profile name, if it looks real.
 *   3. Otherwise whichever non-empty string we have (so the salesperson
 *      at least sees the customer's literal answer, not null).
 *   4. Null only if we truly have nothing.
 */
export function chooseBestName(
  extractedName: string | null | undefined,
  whatsappProfileName: string | null | undefined
): string | null {
  const extracted = extractedName?.trim() || null;
  const profile = whatsappProfileName?.trim() || null;

  if (looksLikeRealName(extracted)) return extracted;
  if (looksLikeRealName(profile)) return profile;

  // Both failed the strict check. Prefer the longer / more-informative one
  // so the salesperson at least has a starting point.
  if (profile && (!extracted || profile.length >= extracted.length)) return profile;
  if (extracted) return extracted;
  return null;
}

/**
 * Light-touch normalization for display: trims whitespace, collapses
 * internal whitespace, title-cases simple ASCII names. Leaves Devanagari
 * alone (Hindi script doesn't have case).
 */
export function normaliseDisplayName(name: string): string {
  const t = name.trim().replace(/\s+/g, ' ');
  if (DEVANAGARI_RANGE.test(t)) return t; // don't touch Hindi
  // Title case ASCII words: "ANSHUL singh" → "Anshul Singh"
  return t
    .split(' ')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}
