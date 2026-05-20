/**
 * Smoke test for the YouTube API client.
 * Usage: pnpm tsx scripts/youtube-smoke.ts
 * Requires YOUTUBE_API_KEY in .env (validated by env.ts on import).
 * Writes raw API responses to data/raw/youtube/... as a side-effect.
 */

import { searchChannels, getChannels } from '../src/lib/youtube/operations';
import { todayUnitsSpent } from '../src/lib/youtube/quota';

async function main() {
  const unitsBefore = await todayUnitsSpent();
  console.log(`Quota before: ${unitsBefore} units spent today`);

  console.log('\nSearching channels for "rassegna stampa"...');
  const searchResult = await searchChannels({ query: 'rassegna stampa', maxResults: 10 });

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

  for (const ch of channelsResult.channels) {
    const subs =
      ch.subscriberCount !== null ? ch.subscriberCount.toLocaleString() : 'hidden';
    console.log(`  [${ch.id}] ${ch.title} — ${subs} subscribers`);
    console.log(`    raw: ${channelsResult.rawPaths[ch.id] ?? '(not stored)'}`);
  }

  const unitsAfter = await todayUnitsSpent();
  const consumed = unitsAfter - unitsBefore;
  console.log(`\nQuota after: ${unitsAfter} units spent today (${consumed} consumed this run)`);

  if (consumed > 100) {
    console.warn(`WARNING: consumed ${consumed} units — expected ≤100 for this smoke run`);
    process.exit(1);
  }

  console.log('Smoke test passed.');
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
