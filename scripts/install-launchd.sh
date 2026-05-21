#!/usr/bin/env bash
set -euo pipefail

# Install or reinstall the launchd plist that schedules the nightly pipeline run.
# Usage: bash scripts/install-launchd.sh [--no-wake]

NO_WAKE=false
for arg in "$@"; do
  case "$arg" in
    --no-wake) NO_WAKE=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE="$SCRIPT_DIR/com.you.creator-pipeline.plist.template"
LABEL="com.you.creator-pipeline"
PLIST_DEST="$HOME/Library/LaunchAgents/$LABEL.plist"

# Load env vars from .env if present
ENV_FILE="$PROJECT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  # Export only PIPELINE_TRIGGER_HOUR and PIPELINE_TRIGGER_MINUTE
  while IFS='=' read -r key value; do
    # Strip comments and blank lines
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    value="${value%%#*}"        # strip inline comments
    value="${value%"${value##*[![:space:]]}"}"  # strip trailing whitespace
    value="${value%\"}" ; value="${value#\"}"   # strip double quotes
    value="${value%\'}" ; value="${value#\'}"   # strip single quotes
    case "$key" in
      PIPELINE_TRIGGER_HOUR) PIPELINE_TRIGGER_HOUR="$value" ;;
      PIPELINE_TRIGGER_MINUTE) PIPELINE_TRIGGER_MINUTE="$value" ;;
    esac
  done < "$ENV_FILE"
fi

HOUR="${PIPELINE_TRIGGER_HOUR:-4}"
MINUTE="${PIPELINE_TRIGGER_MINUTE:-0}"

PNPM_PATH="$(command -v pnpm 2>/dev/null || true)"
if [[ -z "$PNPM_PATH" ]]; then
  echo "Error: pnpm not found in PATH. Install pnpm or ensure it is on your PATH." >&2
  exit 1
fi

echo "Project dir : $PROJECT_DIR"
echo "pnpm        : $PNPM_PATH"
echo "Schedule    : ${HOUR}:$(printf '%02d' "$MINUTE") daily"

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$PROJECT_DIR/data/logs"

# Substitute placeholders into the template
sed \
  -e "s|__PROJECT_DIR__|${PROJECT_DIR}|g" \
  -e "s|__PNPM_PATH__|${PNPM_PATH}|g" \
  -e "s|<integer>__HOUR__</integer>|<integer>${HOUR}</integer>|g" \
  -e "s|<integer>__MINUTE__</integer>|<integer>${MINUTE}</integer>|g" \
  "$TEMPLATE" > "$PLIST_DEST"

echo "Plist written to $PLIST_DEST"

# Unload existing agent if loaded, ignore errors
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

# Load the agent
launchctl bootstrap "gui/$(id -u)" "$PLIST_DEST"
echo "Loaded $LABEL into launchd"

# Optional: wake the Mac one minute before the run so launchd fires on time
if [[ "$NO_WAKE" == false ]]; then
  WAKE_TOTAL_MIN=$(( HOUR * 60 + MINUTE - 1 + 24 * 60 ))
  WAKE_HOUR=$(( (WAKE_TOTAL_MIN / 60) % 24 ))
  WAKE_MIN=$(printf '%02d' $(( WAKE_TOTAL_MIN % 60 )))
  WAKE_TIME="$(printf '%02d' "$WAKE_HOUR"):${WAKE_MIN}:00"
  echo ""
  echo "Optionally setting pmset to wake the Mac at ${WAKE_TIME} (1 min before the run)."
  echo "This requires sudo:"
  if sudo pmset repeat wakeorpoweron MTWRFSU "$WAKE_TIME" 2>/dev/null; then
    echo "pmset wake schedule set."
  else
    echo "Warning: pmset failed or was denied. The Mac must already be awake for launchd to fire."
    echo "Re-run with --no-wake to skip this step."
  fi
fi

echo ""
echo "Next firing time: $(launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep 'next scheduled' || echo '(check with: launchctl print gui/'"$(id -u)"'/$LABEL)')"
echo "Done. Verify with: launchctl list | grep creator-pipeline"
