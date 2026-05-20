const CHARS_PER_TOKEN = 4;
const MARKER_RESERVE_CHARS = 40;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function truncateMiddle(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;

  const maxChars = maxTokens * CHARS_PER_TOKEN - MARKER_RESERVE_CHARS;

  if (maxChars <= 0) {
    return text.slice(0, maxTokens * CHARS_PER_TOKEN);
  }

  const headChars = Math.floor(maxChars * 0.6);
  const tailChars = maxChars - headChars;

  const head = text.slice(0, headChars);
  const tail = tailChars > 0 ? text.slice(text.length - tailChars) : '';
  const omitted = text.slice(headChars, tailChars > 0 ? text.length - tailChars : text.length);
  const omittedTokens = estimateTokens(omitted);

  return `${head}[... ${omittedTokens} tokens omitted ...]${tail}`;
}
