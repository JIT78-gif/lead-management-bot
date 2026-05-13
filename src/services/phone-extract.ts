/**
 * Extract a phone number from an Android call-recording filename.
 *
 * Real-world examples seen on Indian phones:
 *   "Call recording +919876543210_240515_143022.m4a"     (Samsung)
 *   "+91 98765 43210_20240515_143022.m4a"                 (Xiaomi)
 *   "Call recording with +919876543210 at 2024-05-15.amr" (older Android)
 *   "9876543210_outgoing_240515_143022.mp3"               (some MIUI)
 *   "Recording_+91 9876 543 210_240515.opus"              (OnePlus)
 *
 * Strategy: take the LONGEST run of digits (ignoring spaces, dashes, parens
 * and a leading +) that's between 8 and 15 characters, then normalise to
 * the format used in the leads table (digits only, with country code if
 * we can confidently infer one).
 */
export function extractPhoneFromFilename(filename: string): string | null {
  if (!filename) return null;

  // Collect every candidate run of phone-shaped characters.
  const candidates: string[] = [];
  const regex = /(\+?[\d][\d\s\-().]{7,20})/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(filename)) !== null) {
    const raw = m[1] ?? '';
    const cleaned = raw.replace(/\D/g, '');
    if (cleaned.length >= 8 && cleaned.length <= 15) {
      candidates.push(cleaned);
    }
  }
  if (candidates.length === 0) return null;

  // Pick the longest — date timestamps tend to be shorter or filtered out
  // by the 8-char minimum, while phone numbers are 10–13 digits.
  candidates.sort((a, b) => b.length - a.length);
  return normalisePhone(candidates[0]!);
}

/**
 * Normalise a raw digit string to the leads.phone canonical form.
 * Indian 10-digit mobiles (starting 6–9) get a leading 91 added.
 * Other shapes are kept as-is.
 */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return '91' + digits;
  }
  return digits;
}
