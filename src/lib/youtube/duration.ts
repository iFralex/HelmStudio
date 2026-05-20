export function parseIso8601Duration(iso: string): number {
  const match = iso.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match || (match[1] == null && match[2] == null && match[3] == null && match[4] == null && match[5] == null)) {
    throw new Error(`Unparseable ISO 8601 duration: ${iso}`);
  }
  const weeks = parseInt(match[1] ?? '0', 10);
  const days = parseInt(match[2] ?? '0', 10);
  const hours = parseInt(match[3] ?? '0', 10);
  const minutes = parseInt(match[4] ?? '0', 10);
  const seconds = parseInt(match[5] ?? '0', 10);
  return weeks * 604800 + days * 86400 + hours * 3600 + minutes * 60 + seconds;
}
