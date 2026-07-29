# Technical due diligence, July 2026

An engineering assessment written the way an investor's technical reviewer would
write one: what they would find, what it costs to close, in what order. Prepared
28 July against `724c0e5`, remediated through 29 July (`a62e300`).

The presentation version lives as a published artifact; **this file is the
source of record**, because an artifact is not in source control and a finding
that only exists in a link is a finding that will be lost.

**Disclosure.** This audit was produced by the same agent that wrote much of the
code it assesses. Self-audit finds what it knows to look for and misses
assumptions it never questioned. Treat it as a starting inventory, not a clean
bill of health — an external reviewer should independently re-derive the data
provenance and licensing position, which is the one area no amount of code
reading can settle.

## Status

| | count |
|---|---|
| Critical open | 0 |
| High open | 0 |
| Open by explicit decision | 2 — source licensing, outcome loop |
| Closed | 9 |

## Findings and disposition

| # | Finding | Severity | Disposition |
|---|---|---|---|
| 1 | No automated tests, no CI | Critical | **Closed.** 96 tests with a coverage floor; three CI jobs (frontend, ETL, security) on every push |
| 2 | Production Postgres schema not in source control | Critical | **Closed.** 7 tables committed, drift check in CI |
| 3 | Eight high-severity dependency advisories | High | **Closed.** 8 → 3; the remaining three have no fixed release and carry documented review dates |
| 4 | Personal data with no retention or deletion path | High | **Closed.** Privacy notice; 90 days on identifying fields, anonymous structured record retained |
| 5 | Paid endpoints unauthenticated, weak abuse control | High | **Closed.** Postgres-backed per-IP quota plus a global euro ceiling, fails closed with 503 |
| 6 | Unbounded free text reaching model prompts | High | **Closed** during the review. One bound, one sanitiser, fenced with a per-request nonce |
| 7 | No error monitoring or telemetry | High | **Closed.** `event_log` + alerting on the existing database — no new vendor, no new processor to disclose |
| 8 | A 2,544-line module holding six responsibilities | Medium | **Closed.** Decomposed; see below |
| 9 | Country mapping duplicated across nine files | Medium | **Closed.** One module, two CI guards |
| 10 | Licensing position of source registers undocumented | Medium | **Open by decision** — deferred to first paid tier, licensing conversation, or raise |

## What the remediation actually found

Three of the defects above are one defect wearing three costumes.

- A **retired sector list** in `sanitize.ts` silently dropped every live
  request's sector for a day.
- A **country map** in eight files resolved the same name differently depending
  on which extractor read it.
- An **`equals` comparator** in two files was case-sensitive on one code path and
  case-insensitive on the other, so the same rule passed one screen and failed
  the next.

Every copy was individually correct and individually tested. What they shared was
a comment asking a human to keep them in step. Testing alone would not have
surfaced any of them. This is the argument for the structural work, and it is
worth more to a reviewer than the bug count.

The rule adopted: **generate one side from the other; failing that import rather
than copy; and only where neither is possible, fail the build on divergence.**

## What is genuinely strong

| | evidence |
|---|---|
| Rules audited against reality | 108 rules checked against who actually received the money; 96% corroborated; contradicted rules quarantined |
| One vocabulary, two languages | Generated for Python from the TypeScript source; build fails on drift |
| Output measured, not assumed | 12 archetypes; 10 clean, 100% actionable rows |
| Honest uncertainty | 177 instruments carried and labelled "not yet verified" rather than promoted to hard filters |

The last row is the one to press on in diligence, because it is the deliberate
choice: promoting model-inferred gates to hard filters would raise coverage
figures and block founders who actually qualify. **A false block is invisible and
wrong; a thin brief is at least honest.**

## Architecture after Phase 2

| module | job | property |
|---|---|---|
| `shortlist.ts` | which funds are candidates | makes no model calls |
| `adaptiveRound.ts` | what to ask next | every question grounded in a real gate |
| `research.ts` | comparable recipients | only module touching the open web, only one allowed to fail |
| `comparator.ts` | does this answer satisfy this rule | pure, exhaustively tested |
| `panel.tsx` / `panelReport.tsx` / `panelControls.tsx` | intake / rendering / controls | the report half never sets intake state |

Each split was verified by proving the candidate pool was identical for all 12
archetypes before and after — a refactor of scoring code is only safe if you can
show the scores did not move.

## Open by decision

**Source licensing.** 999 distinct source identifiers with no record of which
permit commercial redistribution. The one finding code cannot close. Trigger:
first paid tier, first licensing conversation, or diligence on a raise. Cheapest
path is a source-by-source register drafted from published terms, with only the
ambiguous rows put in front of counsel.

**The outcome loop.** `brief_records` writes every brief with an outcome column
left empty. Populating it is what converts "well-formed" into "correct".
Capture shipped ahead of the decision precisely because it cannot be backfilled.

**Branch protection** on `main` is advisory rather than enforced — appropriate at
one committer, worth revisiting at two.

## Phase 3, measured rather than built

- **Payload** 2.34 MB per request, ~700 instruments of headroom, build fails at 8 MB.
- **Latency** 191s median, dominated by irreducible model time; the streaming
  partial view already absorbs the wait.
- **Evidence depth** is the real accuracy ceiling and an ingestion problem, not
  an architectural one. A second verification pass re-reads each encoded rule
  against its own source quote — independently verified rules went from 25 to
  502, with 74 more recovered by re-reading source documents in a wider window.

All three are instrumented, so the trigger to act announces itself.
