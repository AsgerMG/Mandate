#!/usr/bin/env bash
# Print the brief preview with headless Chrome, so print styling can be SEEN.
#
# FREE — no model calls. Renders /brief/preview (a recorded report through the
# real Memo component and the real stylesheet) and writes a PDF that can be
# read back and looked at.
#
# Every previous change to the print stylesheet shipped unseen, on the belief
# that no browser was available here. Chrome is installed and its headless mode
# prints to PDF directly; that belief was simply never tested.
#
# Usage: bash scripts/preview_pdf.sh [outfile]
set -euo pipefail
OUT="${1:-/tmp/wincent-brief-preview.pdf}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT="${PORT:-3111}"

[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME"; exit 1; }

npx next dev -p "$PORT" >/tmp/preview-dev.log 2>&1 &
DEV=$!
trap 'kill $DEV 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  curl -sf "http://localhost:$PORT/brief/preview" >/dev/null && break
  sleep 1
done

# --no-pdf-header-footer: the running header/footer are the page's own, and
# Chrome's default furniture would print on top of them.
"$CHROME" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$OUT" "http://localhost:$PORT/brief/preview" 2>&1 | tail -1
echo "wrote $OUT"
