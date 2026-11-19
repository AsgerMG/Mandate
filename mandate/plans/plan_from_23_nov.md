# The plan from Monday 23 Nov 2026

One focus: **the census**. Everything else is either tied off by a check in the first hour, runs
in the background on a fixed rhythm, or waits for the census to solve it. The owner says "go
ahead" once; this plan says what then happens without him. Open items live in ONE place,
`mandate/plans/open_loops.yaml` (bench: Needs you -> Open loops). This plan works that list down.

**Rules that hold throughout:** the Claude subscription only (no Anthropic/OpenAI API credit;
Voyage allowed). Production writes only after a dry run, but **approvals are batched, one
AskUserQuestion per market per phase**, each saying what will be written and what was left out.
Insert-only, every fact cited to an official source, archive before any removal. Commit
incrementally; every agent's work ends merged or archived the same day. At most three agents at
once. Every update ends with the status table and what I need from you.

---

## Block 0: the Sunday checks (Monday, first hour, no model)

The weekly run of Sun 22 Nov (03:00 UTC, capital-etl and Regina) ties off five parked items.
For each, read `mandate.runs` / `mandate.run_steps` / `capital.guard_verdicts`, then close the item
in the list or reopen it with the reason and a fix.

| Item | Done when | If not |
|---|---|---|
| First monthly org-chart refresh (`graph core` step) | the step is ok; charts fetched / changed recorded | read the step's error, fix the loader, re-run with `--only graph` |
| Guard `store_schema` | green (039 and 041 are committed now) | `check_schema_replay.py` against a throwaway database, write the missing migration |
| Politico, nine newsletters | all nine `ok` in the policy run | lengthen the spacing; if still refused, retire with the reason |
| Embeddings (2,290 passages, 117 instruments) | under 1% missing | run the embedding step by hand (Voyage) |
| Changed org charts | listed on Needs you | folded into the census, block 2, step 5 |

## Block 1: the brain loop (in the background, one conversation per 5-hour window)

Mechanical; I start each run, read the judgement, act on it, and say what changed. Run from a
worktree made by `scripts/agent-worktree.sh` (it has the database), count `[cN]` against `[wN]`
before quoting any figure.

1. **Forklift under tag arc4** with proposal 4 (senior check 9: flag, do not conclude). Then
   `loop.py decide --proposal 4 --before arc3 --after arc4`: KEEP if the grade does not fall and no
   new must-not is hit; otherwise the loop reverts the file itself.
2. **Cleantech under arc4** (the graph core's second test, last graded 3 on 18 Nov).
3. **The six held-out cases** as conversations (scripts written 19 Nov), one per window across the
   week: the honest score on unseen cases.
4. After each batch: `loop.py diagnose`, one proposal for the weakest move, reviewed by me before
   it is applied, re-tested in the next window. Stop the loop for the week when two proposals in a
   row are reverted (the method is not the bottleneck then; the data is).

## Block 2: THE CENSUS (the one focus)

**Why:** the map was drafted by hand and patched market by market; every patch found new gaps
and a comma bug cut 33 names. France had 173 people against Germany's 1,486 because Germany's
ministries publish name-level PDFs and economie.gouv.fr blocks us, not because France is lean.
Official registers list every public body, its parent and its head. Built from them, the map is
complete by construction and coverage can be measured against it.

### Step 1. The register layer (days 1-2)
- **Migration 046** `capital.register_entries` (market, register, register_id, parent_register_id,
  name, kind, status open/closed, successor, heads with their appointment reference, citation,
  batch), insert-only like the graph core. Dry run, then into the first approval.
- **One loader per register** (`capital/ETL/terms/load_register.py --market M`), every response
  stored in grounding first, no model:

| Market | Register | What it gives |
|---|---|---|
| FR | Annuaire de l'administration API (`api-lannuaire-administration`, 94,096 services) | every service, its parent, the named head with the Journal officiel appointment |
| UK | GOV.UK organisations API (1,273 bodies) | parent and child bodies, status (closed / replaced: DBT -> BIST came from here) |
| IT | IndicePA open data | every administration and its organisational units, with the person responsible |
| EU | EU Whoiswho (Publications Office) | every Commission DG, agency and unit, with the head |
| DE | no central register | the org charts already held, plus the federal budget's Einzelpläne for the budget owners |

- A register's head is checked against the latest appointment where the register cites one (the
  French DGE entry still names a 2018 appointee): older than the newest appointment = flagged.

### Step 2. The scope rule (day 2)
Written once, as code with a test, not as a hand list:
1. **Budget owners:** the ministries / departments / DGs whose budget funds business finance,
   innovation, energy, defence-industrial or export support (DE Einzelpläne, FR loi de finances
   missions, IT MEF budget by ministry, UK departmental estimates, EU MFF programmes and their DG).
2. **Delegated arms:** every body the register places under a budget owner whose remit is to
   fund, lend, guarantee, invest or run a programme (promotional banks, agencies, Projektträger,
   opérateurs, in-house companies, arm's-length bodies, executive agencies).
3. **Vehicles:** the programmes those arms run, with the application process.
Where the register cannot say the remit, an agent (subscription) classifies the body from its
own official page, with the quote. **The knowledge map is regenerated from this rule;** the diff
against today's map is the census's main dry run (new bodies, bodies to drop, renamed or closed).

### Step 3. The grid (day 3)
The bench's Knowledge page becomes one grid: every in-scope body x {register entry, org chart,
people, products, processes, ties}. Each cell is done or carries a stated reason ("ADEME refuses
our fetcher", "the chart names no one"). The grid's totals replace the coverage table; Needs you
shows only the cells that need the owner.

### Step 4. Fill the gaps, layer by layer (days 3-5)
- **The JavaScript-rendering fetch:** headless Chrome (installed) `--dump-dom` as the extractor's
  fallback when a page yields under ~500 characters. It unblocks the JS-only pages: the
  Mecklenburg-Vorpommern portal, the Chips JU and Development Bank of Wales ties, the EDPB feed.
  A 403 or a captcha stays blocked: the register replaces the page (economie.gouv.fr and ADEME
  heads come from the Annuaire).
- **The existing loaders, per market:** charts and tree, units and people, products and processes,
  ties. The same agents (subscription, verbatim quotes, `check_quote.py` before writing).
- **People from the register** where no chart is readable: the head of each unit, with the
  appointment reference.

### Step 5. Close what the census was waiting for (day 5)
Each of these is a parked item with this step as its trigger:
- the 9 changed charts re-read; the 29 UK people no longer in their newest chart re-checked
  against the register (moved, or the department closed);
- UK Export Finance re-parented when its register entry names BIST;
- the blocked sources (ADEME, economie.gouv.fr, ADI Nouvelle-Aquitaine, Mecklenburg-Vorpommern,
  Saarland, Thuringia economy, GRW and ZIM, CDP, EUR-Lex, Council): through the register, the JS
  fetch or another official route; any that still cannot be read stay parked with the reason;
- the two JS-only ties and the EDPB feed.

### Step 6. Measure (end of the week)
- The grid per market: share of in-scope bodies with chart / people / products / processes / ties.
- One held-out case per market as a conversation: database citations against web, and the grade.
- A short brief to the owner: what the census added, what is still blind and why.

**Approval points (batched):** (1) migration 046 + the FR and UK register loads; (2) the IT and EU
register loads; (3) the regenerated map, as one reviewed diff; (4) per market, one write of every
layer found that week. Nothing else waits on the owner.

**Done when:** every in-scope body in the five markets has a grid row with every cell done or a
stated reason; the map is generated by the rule; `open_loops.yaml` has no open item except the
owner's own.

---

## What this plan does NOT do (the owner's own items; on Needs you)
- Proposal 02 (status unlocks): read and approve or change.
- Five numeric grades on test runs (the judge's calibration).
- The home-page line ("advise and draft; you decide and send"): yes or no.
- 11 Dependabot PRs: merge the green ones or close them.
- Regina's expert interview: "let's do the interview for Regina".
- In the main checkout: `web/AGENTS.md` is rewritten by `next dev` (commit or discard);
  `gesetze.txt` is yours.

## Parked beyond this plan (with their triggers)
- Storage trims: the database passes 3.5 GB (the weekly health check flags it).
- Agent on Railway and Fable: a bench dry run graded excellent, then the owner's yes on API budget.
