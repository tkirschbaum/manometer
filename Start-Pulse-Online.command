#!/bin/bash
# Pulse online for macOS: double-click. Starts Pulse and a free Cloudflare tunnel and sets the address on the
# slides by itself, so phones can join from anywhere (mobile data too). Close this window to stop.
cd "$(dirname "$0")" || exit 1
PULSE_ONLINE=1 exec ./Start-Pulse.command
