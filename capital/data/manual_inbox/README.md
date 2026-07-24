# Manual inbox

Drop a freshly-downloaded document here and `make push`
(`ETL/events/extract/push_local.py`) will pick it up automatically on its
next run, using today's date as the `as_of` value.

Naming convention: `<source_key>.<ext>` — the extension doesn't matter, the
script globs `<source_key>.*`. One file per source; if more than one match
exists, the alphabetically-first is used.

| source_key | what to drop here | where it comes from |
|---|---|---|
| `future_fund` | `.html` — a saved copy of the UK Future Fund register page | british-business-bank.co.uk (live page is Cloudflare-gated) |
| `ee_register_stakes` | the RIK bulk JSON export (`osanikud` dump) | avaandmed.eesti.ee |
| `investinor_portfolio` | `.html` — a saved copy of the portfolio page (it's JS-rendered, so "View Source" won't work — save via browser "Save Page As") | investinor.no/portefolje |
| `isif_direct` | `.pdf` — ISIF's annual report | ntma.ie |
| `pfr_ventures` | `.json` — the Airtable export | pfrventures.pl |
| `tesi_directs` | `.pdf` — Tesi's financial review | tesi.fi |

**Not handled here** — these two need an actual code edit when a new annual
report is published, not a file drop, since their extractors hardcode the
source data:
- `bpifrance_urd_stakes` (`ETL/events/extract/extract_bpifrance_urd_stakes.py`)
- `eifo_note12` (`ETL/events/extract/extract_eifo_note12.py`)

**Not handled here either** — `satr` is a deliberate two-step human-reviewed
process (`run_satr_all.sh` then `ETL/events/load/load_satr.py --staging
--apply`), not a plain fetch. Run it by hand.

Files are consumed in place, not deleted — `make push` re-processes
whatever's here every time you run it (each extractor's own dedup logic on
`(source, call_id)` prevents duplicate inserts), so it's safe to leave a
file here across multiple runs. Swap it out when a newer version of the
document is published.
