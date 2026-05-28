/**
 * Print the EXACT prompt (system + user messages) that would be sent to the LLM
 * to generate the outreach email for a channel — without calling the LLM or
 * consuming any quota. Useful for inspecting/debugging prompt content.
 *
 * The greeting and signature footer are NOT part of the prompt: they are added
 * mechanically to the LLM's response, so they are intentionally absent here.
 *
 * Usage:
 *   pnpm draft:prompt --channel <id|@handle>
 *   pnpm draft:prompt <id|@handle>
 *
 * Output: JSON { system, user, language } on stdout.
 */

import { getDb } from '../src/lib/db/client';
import { findChannelByIdOrHandle } from '../src/lib/db/queries';
import { getDraftPrompt } from '../src/lib/services/outreach';

function parseArgs(argv: string[]): { channel?: string } {
  const out: { channel?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === '--channel') {
      out.channel = argv[i + 1];
      i++;
    } else if (!arg.startsWith('--') && out.channel === undefined) {
      out.channel = arg;
    }
  }
  return out;
}

const USAGE = 'Usage: pnpm draft:prompt --channel <id|@handle>';

async function main() {
  const { channel: channelArg } = parseArgs(process.argv.slice(2));
  if (!channelArg) {
    console.error(USAGE);
    process.exit(1);
  }

  const db = getDb();

  const channel = await findChannelByIdOrHandle(channelArg, db);
  if (!channel) {
    console.error(`Channel not found for identifier: ${channelArg}`);
    process.exit(1);
  }

  const prompt = await getDraftPrompt(channel.id, db);
  process.stdout.write(JSON.stringify(prompt, null, 2) + '\n');
}

main().catch((err) => {
  console.error('show-draft-prompt script failed:', err);
  process.exit(1);
});
