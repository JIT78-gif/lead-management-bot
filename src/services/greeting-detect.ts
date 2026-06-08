/**
 * Detects whether the customer's latest message is a bare greeting —
 * the kind of "hi" a customer sends when starting fresh, without any
 * substantive content. Used by the webhook to trigger a soft-reset
 * when a customer returns after a long gap.
 *
 * Conservative: tolerates short emoji-only / very short messages but
 * NOT longer messages that happen to start with "hi". We only want to
 * fire when there's clearly nothing else to engage with.
 */

// Single-word greetings (lowercase, trimmed). If the customer's
// entire message is one of these (after stripping punctuation +
// emojis), it counts as a bare greeting.
const BARE_GREETINGS: ReadonlySet<string> = new Set([
  // English
  'hi', 'hii', 'hiii', 'hello', 'helo', 'hey', 'heyy', 'yo', 'sup',
  'gm', 'gn', 'gud', 'good morning', 'good afternoon', 'good evening',
  // Hindi / Hinglish (Latin spelling)
  'namaste', 'namaskar', 'namashkar', 'pranaam',
  // Urdu / Arabic
  'salam', 'assalam', 'assalamualaikum', 'salaam', 'walaikum',
  // Spanish (in case)
  'hola',
]);

// Strip emojis + punctuation but keep letters and spaces.
function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    // Remove any character that isn't a letter or whitespace.
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isBareGreeting(text: string | null | undefined): boolean {
  if (!text) return false;
  const cleaned = normalise(text);
  if (cleaned === '') return false;
  // Allow up to 3 short words so things like "hi there" / "hello sir"
  // also count, but reject longer sentences.
  const words = cleaned.split(' ');
  if (words.length > 3) return false;
  // The first word (or the whole string) must be in the set.
  if (BARE_GREETINGS.has(cleaned)) return true;
  const first = words[0]!;
  if (!BARE_GREETINGS.has(first)) return false;
  // For multi-word, all remaining words must be common pleasantries
  // — otherwise it's likely a real message ("hi I want automation").
  const pleasantries = new Set([
    'there', 'sir', 'madam', 'maam', 'mam', 'bro', 'bhai', 'friend',
    'team', 'botifys', 'guys',
  ]);
  return words.slice(1).every((w) => pleasantries.has(w));
}
