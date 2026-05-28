/**
 * One-time backfill: recompute `pitchLanguage` on existing qualifications from
 * the channel's country. Older rows were written with a hardcoded 'en', which
 * made outreach drafts come out in English even for Italian channels.
 *
 * Idempotent and safe to re-run. Usage:
 *   pnpm backfill:pitch-language
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../src/lib/db/client';
import { qualifications, channels } from '../src/lib/db/schema';
import { pitchLanguageForCountry } from '../src/lib/outreach/pitch-language';

async function main() {
  const db = getDb();

  const rows = db
    .select({
      id: qualifications.id,
      current: qualifications.pitchLanguage,
      country: channels.country,
    })
    .from(qualifications)
    .leftJoin(channels, eq(qualifications.channelId, channels.id))
    .all();

  const tally = { it: 0, en: 0 };
  let updated = 0;

  db.transaction((tx) => {
    for (const r of rows) {
      const lang = pitchLanguageForCountry(r.country);
      tally[lang]++;
      if (r.current !== lang) {
        tx.update(qualifications).set({ pitchLanguage: lang }).where(eq(qualifications.id, r.id)).run();
        updated++;
      }
    }
  });

  console.log(
    `Qualifications scanned: ${rows.length} | target it=${tally.it} en=${tally.en} | rows updated: ${updated}`,
  );
}

main().catch((err) => {
  console.error('backfill-pitch-language script failed:', err);
  process.exit(1);
});
