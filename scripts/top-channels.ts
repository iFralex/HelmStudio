/**
 * Print the top N qualified channels by automation score that do NOT yet have
 * an email address — i.e. the best outreach leads still to contact.
 *
 * Only channels with a score (latestAutomationScore not null) are considered,
 * ordered by score descending.
 *
 * Usage:
 *   pnpm channels:top [--limit N]
 *   pnpm channels:top N
 *
 * Output: JSON array of { id, title, handle, score, subscriberCount, outreachStatus } on stdout.
 */

import { getDb } from '../src/lib/db/client';
import { topChannelsWithoutEmail } from '../src/lib/db/queries';

function parseLimit(argv: string[]): number {
  let raw: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === '--limit') {
      raw = argv[i + 1];
      i++;
    } else if (!arg.startsWith('--') && raw === undefined) {
      raw = arg;
    }
  }

  if (raw === undefined) return 10;

  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    console.error('--limit must be a positive integer');
    process.exit(1);
  }
  return n;
}

async function main() {
  const limit = parseLimit(process.argv.slice(2));

  const db = getDb();
  const channels = await topChannelsWithoutEmail(limit, db);

  const output = channels.map((c) => ({
    id: c.id,
    title: c.title,
    handle: c.handle,
    score: c.latestAutomationScore,
    subscriberCount: c.subscriberCount,
    outreachStatus: c.outreachStatus,
  }));

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main().catch((err) => {
  console.error('top-channels script failed:', err);
  process.exit(1);
});
