/**
 * Smoke test for the transcript fetcher.
 * Usage: pnpm tsx scripts/transcript-smoke.ts <videoId>
 * Does not require any API key — uses YouTube's public timedtext endpoint.
 */

import { fetchTranscript } from '../src/lib/transcripts/fetcher';

async function main() {
  const videoId = process.argv[2];
  if (!videoId) {
    console.error('Usage: pnpm tsx scripts/transcript-smoke.ts <videoId>');
    process.exit(1);
  }

  console.log(`Fetching transcript for video: ${videoId}`);
  const result = await fetchTranscript(videoId);

  if (!result.ok) {
    console.log(`Result: FAILED`);
    console.log(`  reason:  ${result.reason}`);
    console.log(`  message: ${result.message}`);
    process.exit(0);
  }

  const firstSeg = result.segments[0];
  console.log(`Result: OK`);
  console.log(`  language:       ${result.language}`);
  console.log(`  characters:     ${result.characterCount}`);
  console.log(`  segments:       ${result.segments.length}`);
  if (firstSeg) {
    console.log(`  first segment:  start=${firstSeg.start.toFixed(2)}s  duration=${firstSeg.duration.toFixed(2)}s`);
    console.log(`  first text:     ${JSON.stringify(firstSeg.text)}`);
  }
  console.log(`  preview:        ${result.text.slice(0, 200)}${result.characterCount > 200 ? '...' : ''}`);
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
