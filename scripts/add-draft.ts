/**
 * Manually add an outreach draft to a channel BEFORE an email address is entered.
 * When the operator later enters the recipient address in the UI, this existing
 * draft is reused instead of generating a new one via the LLM.
 *
 * Usage:
 *   pnpm tsx scripts/add-draft.ts --channel <id|@handle> --subject "..." \
 *     (--body "..." | --body-file path.txt) [--lang it|en] [--name "Mario"]
 *
 * The body is the email CORE only — greeting ("Ciao [Nome],") and the signature
 * footer are prepended/appended automatically, exactly like the LLM path.
 */

import { readFileSync } from 'node:fs';
import { getDb } from '../src/lib/db/client';
import { findChannelByIdOrHandle } from '../src/lib/db/queries';
import { addManualDraft } from '../src/lib/services/outreach';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      console.error(`Missing value for --${key}`);
      process.exit(1);
    }
    out[key] = next;
    i++;
  }
  return out;
}

const USAGE =
  'Usage: pnpm tsx scripts/add-draft.ts --channel <id|@handle> --subject "..." (--body "..." | --body-file path.txt) [--lang it|en] [--name "Mario"]';

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const channelArg = args.channel;
  const subject = args.subject;
  const lang = (args.lang ?? 'it') as 'it' | 'en';
  const recipientFirstName = args.name ?? null;

  if (!channelArg || !subject || (!args.body && !args['body-file'])) {
    console.error(USAGE);
    process.exit(1);
  }
  if (lang !== 'it' && lang !== 'en') {
    console.error('--lang must be "it" or "en"');
    process.exit(1);
  }

  const body = args['body-file'] ? readFileSync(args['body-file'], 'utf8') : (args.body ?? '');
  if (!body.trim()) {
    console.error('Draft body is empty');
    process.exit(1);
  }

  const db = getDb();

  const channel = await findChannelByIdOrHandle(channelArg, db);
  if (!channel) {
    console.error(`Channel not found for identifier: ${channelArg}`);
    process.exit(1);
  }

  const { draftId } = await addManualDraft(
    { channelId: channel.id, subject, body, language: lang, recipientFirstName },
    db,
  );

  console.log(`Draft #${draftId} added for channel ${channel.id} (${channel.title}).`);
  console.log(`Outreach status unchanged — enter the email address in the UI to mark it as drafted.`);
}

main().catch((err) => {
  console.error('add-draft script failed:', err);
  process.exit(1);
});
