/**
 * Builds the .command file that, when double-clicked on macOS, opens one
 * pre-composed Mail.app draft per outreach item and finally calls back to
 * the local Next.js server with the batch token so the admin DB can mark
 * each channel as 'sent'.
 *
 * Design choices:
 *  - Drafts are opened as visible windows (not auto-sent) so the user can
 *    review and click Send manually. Cold outreach at low volume = manual
 *    send is the right safety net.
 *  - The sender address must match an account configured in Mail.app
 *    exactly. We assume martina@helmstudio.it is set up.
 *  - The script writes a per-recipient progress line to stdout so a Terminal
 *    window shows feedback (Terminal auto-opens for .command files).
 *  - The callback is wrapped in `|| true` so a curl failure (server down,
 *    network issue) does not crash the script before all drafts are opened.
 */

export const OUTREACH_SENDER = 'Martina Coluzzi <martina@helmstudio.it>';

export type OutreachQueueItem = {
  channelId: string;
  channelTitle: string;
  recipientEmail: string;
  subject: string;
  /** Plain text body. The .command sends plain text only (see plan rationale). */
  body: string;
};

/**
 * Escape a string for embedding inside an AppleScript `"..."` literal.
 *
 * AppleScript string literals only need:
 *   - backslash → \\
 *   - double quote → \"
 *
 * Newlines and other control chars can stay literal (the surrounding bash
 * heredoc is single-quoted, so bash does not touch them).
 */
function escapeAppleScriptString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Escape a string for embedding inside a single-quoted bash string. Bash
 * single quotes have one escape rule: a single quote cannot appear inside
 * them. The standard workaround is to close the quote, insert an escaped
 * quote, and reopen: `'...'\''...'`.
 */
function escapeBashSingleQuoted(s: string): string {
  return s.replace(/'/g, `'\\''`);
}

export function buildOutreachCommand(opts: {
  items: OutreachQueueItem[];
  token: string;
  /** Full URL to POST the consume callback to, e.g. http://localhost:3000/api/outreach/batch/consume */
  callbackUrl: string;
}): string {
  const { items, token, callbackUrl } = opts;

  if (items.length === 0) {
    throw new Error('buildOutreachCommand: items must be non-empty');
  }

  // Build the AppleScript body — one `make new outgoing message` block per
  // recipient, all nested in a single `tell application "Mail"` block so
  // Mail.app launches once.
  const messageBlocks = items
    .map((item, idx) => {
      const subject = escapeAppleScriptString(item.subject);
      const body = escapeAppleScriptString(item.body);
      const recipient = escapeAppleScriptString(item.recipientEmail);
      const sender = escapeAppleScriptString(OUTREACH_SENDER);
      const channelLabel = escapeAppleScriptString(
        `${item.channelTitle} (${item.recipientEmail})`,
      );

      return `        log "[${idx + 1}/${items.length}] Opening draft for ${channelLabel}"
        set msg${idx} to make new outgoing message with properties {sender:"${sender}", subject:"${subject}", content:"${body}", visible:true}
        tell msg${idx}
            make new to recipient with properties {address:"${recipient}"}
        end tell`;
    })
    .join('\n\n');

  const appleScript = `tell application "Mail"
    activate
${messageBlocks}
end tell`;

  // The .command file is a bash script. Heredoc with quoted 'APPLESCRIPT' so
  // bash does not interpolate $vars or backticks inside the AppleScript body.
  const callbackPayload = `{"token":"${escapeBashSingleQuoted(token)}"}`;

  return `#!/bin/bash
# HELM Studio — Outreach batch (${items.length} ${items.length === 1 ? 'draft' : 'drafts'})
# Generated at ${new Date().toISOString()}
#
# What this does:
#   1. Opens Mail.app and creates ${items.length} pre-composed draft${items.length === 1 ? '' : 's'}
#      addressed to the queued creators (sender: ${OUTREACH_SENDER}).
#   2. Each draft opens in a visible window — review, edit if needed, then
#      click Send manually.
#   3. When all drafts are created, pings the local admin server to mark
#      every channel in this batch as 'sent' in the database.
#
# Requirements:
#   - Mail.app configured with the account ${OUTREACH_SENDER}
#   - Admin running at ${new URL(callbackUrl).origin}
#
# If this is your first time running this file, make it executable once:
#   chmod +x "$0"

set -u

echo "HELM Studio — opening ${items.length} draft${items.length === 1 ? '' : 's'} in Mail.app..."
echo ""

osascript <<'APPLESCRIPT'
${appleScript}
APPLESCRIPT

osascript_exit=$?
if [ $osascript_exit -ne 0 ]; then
    echo ""
    echo "⚠ AppleScript exited with code $osascript_exit."
    echo "  Mail.app may not be configured with the sender ${OUTREACH_SENDER}."
    echo "  Drafts that were already opened are still in your Outbox."
    echo ""
    read -n 1 -s -r -p "Press any key to close..."
    exit $osascript_exit
fi

echo ""
echo "✓ ${items.length} draft${items.length === 1 ? '' : 's'} opened in Mail.app."
echo "  Review each one and click Send to deliver."
echo ""
echo "Marking batch as sent in admin..."

curl -sS -X POST '${escapeBashSingleQuoted(callbackUrl)}' \\
    -H 'Content-Type: application/json' \\
    -d '${escapeBashSingleQuoted(callbackPayload)}' \\
    && echo "✓ Admin notified." \\
    || echo "⚠ Could not reach admin at ${escapeBashSingleQuoted(callbackUrl)} — mark channels as sent manually."

echo ""
read -n 1 -s -r -p "Press any key to close..."
`;
}

/**
 * Pick a filename for the downloaded .command, including a date stamp so
 * multiple downloads in one day do not silently overwrite each other in
 * ~/Downloads.
 */
export function outreachCommandFilename(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `helmstudio-outreach-${yyyy}${mm}${dd}-${hh}${mi}.command`;
}
