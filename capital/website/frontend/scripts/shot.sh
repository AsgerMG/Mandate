#!/usr/bin/env bash
# Screenshot any page of the running site, so visual work can be SEEN.
#
# FREE — no model calls. Companion to preview_pdf.sh: that one prints, this one
# captures the screen rendering at a chosen width.
#
# Chrome is installed on this machine and its headless mode screenshots a URL
# directly. For most of this project that was assumed unavailable and every
# visual change shipped unverified; the first render exposed three defects in
# one look, including a print stylesheet that only worked from the Export
# button and printed the whole marketing page from Cmd+P.
#
# Usage: bash scripts/shot.sh /brief/preview [out.png] [width]
set -euo pipefail
ROUTE="${1:-/}"
OUT="${2:-/tmp/wincent-shot.png}"
WIDTH="${3:-1440}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT="${PORT:-3112}"

[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME"; exit 1; }

STARTED=""
if ! curl -sf "http://localhost:$PORT" >/dev/null 2>&1; then
  npx next dev -p "$PORT" >/tmp/shot-dev.log 2>&1 &
  STARTED=$!
  trap 'kill $STARTED 2>/dev/null || true' EXIT
  for _ in $(seq 1 60); do
    curl -sf "http://localhost:$PORT$ROUTE" >/dev/null && break
    sleep 1
  done
fi

"$CHROME" --headless --disable-gpu --hide-scrollbars \
  --window-size="$WIDTH,2400" --screenshot="$OUT" \
  "http://localhost:$PORT$ROUTE" 2>&1 | tail -1
echo "wrote $OUT"
