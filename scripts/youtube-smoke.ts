/**
 * Smoke test for the YouTube API client.
 * Usage: pnpm tsx scripts/youtube-smoke.ts [--record]
 * Requires YOUTUBE_API_KEY in .env (validated by env.ts on import).
 * Writes raw API responses to data/raw/youtube/... as a side-effect.
 * Pass --record to also save responses to src/lib/youtube/__tests__/fixtures/.
 */

import fs from 'fs/promises';
import path from 'path';
import { searchChannels, getChannels } from '../src/lib/youtube/operations';
import { todayUnitsSpent } from '../src/lib/youtube/quota';
import { absolutePath } from '../src/lib/storage/paths';

const RECORD = process.argv.includes('--record');
const FIXTURES_DIR = path.resolve(import.meta.dirname, '../src/lib/youtube/__tests__/fixtures');

async function saveFixture(name: string, data: unknown): Promise<void> {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  await fs.writeFile(path.join(FIXTURES_DIR, name), JSON.stringify(data, null, 2), 'utf8');
  console.log(`  Recorded fixture: ${name}`);
}

async function main() {
  const unitsBefore = await todayUnitsSpent();
  console.log(`Quota before: ${unitsBefore} units spent today`);

  console.log('\nSearching channels for "rassegna stampa"...');
  const searchResult = await searchChannels({ query: 'rassegna stampa', maxResults: 10 });
  if (RECORD) {
    const raw = await fs.readFile(absolutePath(searchResult.rawPath), 'utf8');
    await saveFixture('search.list.json', JSON.parse(raw));
  }

  const topThree = searchResult.channelIds.slice(0, 3);
  console.log(`Found ${searchResult.channelIds.length} channel IDs; top 3:`);
  for (const id of topThree) {
    console.log(`  ${id}`);
  }
  console.log(`Raw search response written to: ${searchResult.rawPath}`);

  if (topThree.length === 0) {
    console.log('No channels found — cannot fetch channel details.');
    process.exit(0);
  }

  console.log('\nFetching channel details...');
  const channelsResult = await getChannels({ ids: topThree });
  if (RECORD && Object.keys(channelsResult.rawPaths).length > 0) {
    // getChannels stores individual items per channel; reconstruct the API response envelope
    const items = await Promise.all(
      Object.values(channelsResult.rawPaths).map(async (p) => {
        const raw = await fs.readFile(absolutePath(p), 'utf8');
        return JSON.parse(raw) as unknown;
      }),
    );
    await saveFixture('channels.list.json', {
      kind: 'youtube#channelListResponse',
      etag: '',
      pageInfo: { totalResults: items.length, resultsPerPage: 50 },
      items,
    });
  }

  for (const ch of channelsResult.channels) {
    const subs =
      ch.subscriberCount !== null ? ch.subscriberCount.toLocaleString() : 'hidden';
    console.log(`  [${ch.id}] ${ch.title} — ${subs} subscribers`);
    console.log(`    raw: ${channelsResult.rawPaths[ch.id] ?? '(not stored)'}`);
  }

  const unitsAfter = await todayUnitsSpent();
  const consumed = unitsAfter - unitsBefore;
  console.log(`\nQuota after: ${unitsAfter} units spent today (${consumed} consumed this run)`);

  if (consumed > 120) {
    console.warn(`WARNING: consumed ${consumed} units — expected ≤120 for this smoke run`);
    process.exit(1);
  }

  console.log('Smoke test passed.');
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
