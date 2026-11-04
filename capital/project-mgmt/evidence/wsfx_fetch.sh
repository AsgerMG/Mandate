#!/bin/bash
# wsFX — fetch funder pages. Public pages only, no credentials, no API keys.
# Usage: fetch.sh <urls-file> <outdir>
URLS="$1"; OUT="$2"; mkdir -p "$OUT"
i=0
while IFS=$'\t' read -r id url; do
  [ -z "$url" ] && continue
  [ "$url" = "-" ] && continue
  i=$((i+1))
  f="$OUT/$id"
  [ -s "$f.html" ] && continue
  code=$(curl -sSL --compressed --max-time 25 \
    -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' \
    -H 'Accept: text/html,application/xhtml+xml' \
    -o "$f.html" -w '%{http_code}' "$url" 2>"$f.err")
  echo -e "$id\t$code\t$url" >> "$OUT/_status.tsv"
done < "$URLS"
echo "fetched $i"
