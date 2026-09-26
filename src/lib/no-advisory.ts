/**
 * Forbidden advisory phrases. Any text the platform shows the user — AI-generated
 * narrative included — is scanned through `findAdvisoryPhrase` before render.
 * The product surfaces facts and math; it never counsels (CLAUDE.md §5).
 */
export const FORBIDDEN_ADVISORY_PATTERNS: readonly RegExp[] = [
  /\brecommend\b/i,
  /\bwe suggest\b/i,
  /\byou should\b/i,
  /\bshould (?:switch|use|consider|avoid|prefer)\b/i,
  /\bbest (?:choice|option|model)\b/i,
  /\boptimal model\b/i,
  /\badvisable\b/i,
  /\bbetter (?:to|model)\b/i,
  /\bworse (?:to|model)\b/i,
  /\bavoid this\b/i,
  /\bconsider switching\b/i,
];

/** The offending phrase the first pattern matches, or null when the text is clean. */
export function findAdvisoryPhrase(text: string): string | null {
  for (const re of FORBIDDEN_ADVISORY_PATTERNS) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}
