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
  // skip / refuse intent
  'skip', 'skipp', 'pass', 'next', 'later', 'private',
]);

// Words that — when present in a multi-word answer — strongly signal that
// the text is a SENTENCE / INSTRUCTION / OBJECTION, not a name.
// Detecting these stops disasters like a lead with name="you can skipp
// this question" or name="i don't want to share".
const SENTENCE_INDICATORS: ReadonlySet<string> = new Set([
  'skip', 'skipp', 'skipped', 'skipping',
  'dont', "don't", 'doesnt', "doesn't", 'wont', "won't",
  'cant', "can't", 'cannot', 'isnt', "isn't",
  'question', 'questions', 'ask', 'asking', 'answer', 'answers',
  'reply', 'replies', 'tell', 'share', 'give', 'send',
  'pricing', 'price', 'cost', 'rate', 'rates',
  'why', 'how', 'when', 'where', 'what', 'which', 'who',
  'need', 'want', 'know', 'understand', 'mean', 'think',
  'later', 'soon', 'now', 'today', 'tomorrow', 'never',
  'please', 'sorry', 'thank', 'thanks',
  'this', 'that', 'these', 'those',
  'business', 'company', 'team', 'work', 'call',
]);

// First-word pronouns that signal a sentence rather than a name.
const SENTENCE_STARTERS: ReadonlySet<string> = new Set([
  'you', 'we', 'they', 'this', 'that', 'it', 'there', 'here',
  'do', 'does', 'did', 'is', 'are', 'was', 'were', 'will', 'would',
  'can', 'could', 'should', 'may', 'might',
  'please', 'sorry', 'just',
]);

/**
 * Detect inputs that look like a sentence, command, or objection rather
 * than a name. Multi-word inputs containing skip/refuse/objection words,
 * question marks, or sentence-starter pronouns are rejected.
 */
function looksLikeSentence(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length === 0) return false;

  // Anything ending in a question mark is a question, not a name.
  if (/[?]/.test(trimmed)) return true;

  const lower = trimmed.toLowerCase();
  const words = lower.split(/\s+/);

  // Real names are typically 1-4 words ("Anshul", "Anshul Singh",
  // "Anshul Kumar Singh Bhatia"). 5+ words is almost certainly a sentence.
  if (words.length >= 5) return true;

  // Multi-word + contains a sentence-indicator → sentence.
  if (words.length >= 2) {
    if (SENTENCE_STARTERS.has(words[0]!)) return true;
    if (words.some((w) => SENTENCE_INDICATORS.has(w))) return true;
  }

  return false;
}

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

  // Reject sentences / commands / objections like "you can skip this
  // question" or "i don't want to share my name".
  if (looksLikeSentence(trimmed)) return false;

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
 *   3. Otherwise NULL — better an "Unnamed lead" the salesperson can
 *      ask about on the call than something misleading like
 *      "you can skipp this question" sitting in the dashboard forever.
 *
 * (The WhatsApp profile name is also stored separately on the
 * conversation row, so the salesperson can still see whatever name they
 * had set even when we choose null here.)
 */
export function chooseBestName(
  extractedName: string | null | undefined,
  whatsappProfileName: string | null | undefined
): string | null {
  const extracted = extractedName?.trim() || null;
  const profile = whatsappProfileName?.trim() || null;

  if (looksLikeRealName(extracted)) return extracted;
  if (looksLikeRealName(profile)) return profile;
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
