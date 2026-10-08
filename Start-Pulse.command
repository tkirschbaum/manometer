#!/bin/bash
# Pulse for macOS: double-click to set up (first time) and start. Close this window (or Ctrl+C) to stop.
# Start-Pulse-Online.command runs this with PULSE_ONLINE=1: Pulse plus a free tunnel, so phones can join.
cd "$(dirname "$0")" || exit 1
fail() { echo; echo "Something went wrong. Scroll up for the error message, or see README.md."; read -r -p "Press Enter to close."; exit 1; }

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is missing. Install the LTS version from https://nodejs.org and run this file again."
  open "https://nodejs.org/en/download"
  read -r -p "Press Enter to close."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Installing pnpm (you may be asked for your Mac password) ..."
  npm install -g pnpm 2>/dev/null || sudo npm install -g pnpm || fail
fi

[ -d node_modules ] || { echo "Installing dependencies ..."; pnpm install || fail; }
[ -f .env ] || { echo "First start: setting up Pulse on this Mac ..."; pnpm setup:local || fail; }
[ -f apps/server/dist/index.js ] || pnpm build || fail

echo
if [ "$PULSE_ONLINE" = "1" ]; then
  echo "Starting Pulse online (phones can join from anywhere) ..."
  exec node scripts/online.mjs
fi
echo "Pulse runs on https://localhost:3443 - keep this window open while presenting."
(sleep 3; open "https://localhost:3443/") &
exec pnpm start
