# Where the workstream run outputs went

On 2026-11-06 (E2, archive and CI) every `*_ws*` entry in this directory, 213
files and directories, about 30 MB of run logs, traces, tapes and write-ups,
moved to `../archive/findings/` under the SAME name. A path cited in code or
in a document as `project-mgmt/findings/<name>` is now
`project-mgmt/archive/findings/<name>`. Git history is intact (`git log
--follow`).

Left here because code reads them:

- `wsCO_window_register.json`: read by `web/scripts/check_window_evidence.ts`
- `reband_ticket_gates_wsAZ_before.json`: read by `ETL/terms/reband_ticket_gates.py`
- `tokens_wsHI/`: `measured_menus.json` is read by `web/scripts/check_maxtok_headroom.ts`
- the `wsU_*` / `wsAJ_*` extraction records: read by `check_extracted_quotes.ts`

`check_published_figures.ts` and `check_extracted_quotes.ts` read both
directories, so a figure tagged `[ok <name>]` still resolves.
`check_maxtok_headroom.ts` walks all of `project-mgmt/`, archive included.

`../dashboard/` (the old agent dashboard: agents.json, blockers.json, next.json,
two HTML pages and its refresh.py) moved to `../archive/dashboard/`; no tracked
file read it.
