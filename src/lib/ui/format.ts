export function formatCompact(n: number, locale = 'it-IT'): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatNumber(n: number, locale = 'it-IT'): string {
  return new Intl.NumberFormat(locale).format(n);
}

export function formatDate(d: Date | number, locale = 'it-IT'): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatRelative(d: Date | number | string, locale = 'it-IT'): string {
  const date = typeof d === 'number' ? new Date(d) : typeof d === 'string' ? new Date(d) : d;
  const diffMs = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  const absMs = Math.abs(diffMs);
  const diffSeconds = Math.round(diffMs / 1_000);
  const diffMinutes = Math.round(diffMs / 60_000);
  const diffHours = Math.round(diffMs / 3_600_000);
  const diffDays = Math.round(diffMs / 86_400_000);
  const diffWeeks = Math.round(diffMs / 604_800_000);
  const diffMonths = Math.round(diffMs / 2_592_000_000);
  const diffYears = Math.round(diffMs / 31_536_000_000);

  if (absMs < 60_000) return rtf.format(diffSeconds, 'second');
  if (absMs < 3_600_000) return rtf.format(diffMinutes, 'minute');
  if (absMs < 86_400_000) return rtf.format(diffHours, 'hour');
  if (absMs < 604_800_000) return rtf.format(diffDays, 'day');
  if (absMs < 2_592_000_000) return rtf.format(diffWeeks, 'week');
  if (absMs < 31_536_000_000) return rtf.format(diffMonths, 'month');
  return rtf.format(diffYears, 'year');
}

export function scoreColor(score: number | null): 'green' | 'yellow' | 'gray' {
  if (score === null || score === undefined) return 'gray';
  if (score >= 70) return 'green';
  if (score >= 40) return 'yellow';
  return 'gray';
}
