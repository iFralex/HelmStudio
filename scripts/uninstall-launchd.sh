#!/usr/bin/env bash
set -euo pipefail

# Unload and remove the launchd plist for the nightly pipeline run.

LABEL="com.you.creator-pipeline"
PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

# Unload agent (ignore if not loaded)
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null && echo "Unloaded $LABEL" || echo "$LABEL was not loaded"

# Remove plist file
if [[ -f "$PLIST_DEST" ]]; then
  rm "$PLIST_DEST"
  echo "Removed $PLIST_DEST"
else
  echo "Plist not found at $PLIST_DEST (already removed?)"
fi

echo "Done. Verify with: launchctl list | grep creator-pipeline"
