#!/usr/bin/env bash
# The citation gaps: 790 eligibility gate/clause rows cite one of 171 URLs that
# were never saved. Fetch each URL (politely) into the grounding store, link the
# rows whose quote is found in what the page serves today, and report the rest.
#
#   bash mandate/ops/citation_gaps.sh           # dry run: rows, URLs, hosts, duration. No request.
#   bash mandate/ops/citation_gaps.sh --apply   # fetch + store + link (refuses until grounding is live)
#
# Depends on the grounding go-live (mandate/ops/go_live_sunday.sh): it REFUSES
# while grounding.documents is empty or capital migration 034 has not run.
# Writes: grounding documents/versions/fetches + originals in the bucket
# `mandate-grounding` (append-only), and capital.eligibility_grounding rows
# with method 'url_fetched' and the quote's span. Nothing is overwritten.
# Polite: one request at a time, >= 5 s between requests to one host,
# robots.txt honoured, Retry-After obeyed; User-Agent names the product, not a
# person. Idempotent: a URL fetched in the last 30 days is reused, links are
# ON CONFLICT DO NOTHING, each URL commits on its own (kill and re-run).
# Cost: $0 (no model call). Duration: ~6-15 minutes (171 URLs on 102 hosts).
# Output: $OUT/quotes_not_found.jsonl (the rows NOT linked, and why) and
# $OUT/fetch_failures.json.
set -euo pipefail
cd "$(dirname "$0")/../.."; ROOT=$PWD
source mandate/ops/_railway.sh
URLS=~/Mandate-backups/2026-11-05/work/grounding/urls_to_fetch.json
OUT=~/Mandate-backups/citation_gaps/$(date -u +%Y%m%d)
PY=""
for cand in python3 "$ROOT/policy/.venv/bin/python"; do
  if "$cand" -c "import psycopg, httpx, pdfplumber" 2>/dev/null; then PY=$cand; break; fi
done
[ -n "$PY" ] || { echo "needs a python with psycopg, httpx and pdfplumber (PDF quotes are located" \
                       "in the PDF's text): pip install 'psycopg[binary]' httpx pdfplumber" >&2; exit 1; }
[ -f "$URLS" ] || { echo "missing $URLS (the 2026-11-05 backup)" >&2; exit 1; }
M="mandate/grounding/migrations/capital_url_citations.py"
export PYTHONPATH="$ROOT"

if [ "${1:-}" != "--apply" ]; then
  RO=$(db_var CAPITAL_RO_DATABASE_PUBLIC_URL)
  "$PY" "$M" --source-url "$RO" --urls "$URLS" --out "$OUT"
  echo; echo "Next: bash mandate/ops/citation_gaps.sh --apply"
  exit 0
fi
CAPITAL=$(db_var CAPITAL_DATABASE_PUBLIC_URL)
bucket_env
mkdir -p "$OUT"
"$PY" "$M" --apply --database-url "$CAPITAL" --urls "$URLS" --out "$OUT" 2>&1 | tee "$OUT/run.log"
