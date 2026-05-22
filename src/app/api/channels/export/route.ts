import { NextRequest, NextResponse } from 'next/server';
import { listChannelsForUi } from '@/lib/db/queries';
import { parseChannelsFilters } from '@/lib/db/list-channels-filters';

function csvCell(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function csvRow(values: (string | number | Date | null | undefined)[]): string {
  return values.map(csvCell).join(',');
}

const CSV_HEADERS = [
  'id',
  'youtubeChannelId',
  'titolo',
  'handle',
  'iscritti',
  'paese',
  'lingua',
  'videoTotali',
  'nicchia',
  'format',
  'score',
  'confidence',
  'linguaPitch',
  'email',
  'statoOutreach',
  'qualificatoIl',
  'discoveredIl',
  'discoverySource',
  'urlYoutube',
];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of searchParams.entries()) {
    flat[key] = value;
  }

  const baseFilters = parseChannelsFilters(flat, 500);

  const today = new Date().toISOString().slice(0, 10);
  const filename = `canali-${today}.csv`;

  const lines: string[] = [CSV_HEADERS.join(',')];

  let page = 1;
  while (true) {
    const result = await listChannelsForUi({ ...baseFilters, page, pageSize: 500 });

    for (const ch of result.rows) {
      const q = ch.latestQualification;
      lines.push(
        csvRow([
          ch.id,
          ch.id,
          ch.title,
          ch.handle,
          ch.subscriberCount,
          ch.country,
          ch.defaultLanguage,
          ch.videoCount,
          q?.nicheClassification,
          q?.formatType,
          ch.latestAutomationScore,
          q?.confidence,
          q?.pitchLanguage,
          ch.email,
          ch.outreachStatus,
          ch.lastQualifiedAt,
          ch.discoveredAt,
          ch.discoverySource,
          `https://youtube.com/channel/${ch.id}`,
        ]),
      );
    }

    if (result.rows.length < 500) break;
    page++;
    if (page > 1000) break;
  }

  const csv = lines.join('\r\n') + '\r\n';

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
