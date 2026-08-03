# Final judgement on the data corpus

Written 2026-08-02, closing the grounding work. Every number measured, not
estimated. Re-measure with `python3 ETL/terms/coverage_report.py`.

## The judgement

**The corpus is good enough for a senior advisor to act on, and further work on
it has hit diminishing returns.** Stop treating data completeness as the
bottleneck. It was, for most of this project's life. It is not now.

| Axis a founder needs answered | Coverage |
|---|---:|
| Who it is for (2+ evaluable filters) | 95.7% |
| What it has actually funded | 99.7% |
| Where it applies | 100% |
| What it typically awards | 90.5% |
| How to approach it | 97.3% |
| Award recency on record | 97.7% |
| **Complete on all six** | **745 / 864 (86%)** |

950 instruments, EUR 458B, 22 countries, 2021-present.

## What changed in this session, and why it counts

Four things moved the corpus from "mostly measured" to "mostly grounded in a
filed source", which is a different claim:

- **480 funds now carry a name from a public register** rather than the name of
  the body that granted the money. Instruments sharing a display name: 505 -> 193.
- **234 aid-intensity ceilings are grounded in the Commission's own
  registration** rather than a majority vote across award history. The register
  also names the research category, which this repo had asserted was unknowable
  at instrument level.
- **220 funds whose scheme legally closed are no longer proposable.** Award
  recency cannot see this: payments run for years past closure, and 130 of them
  looked current on a 2024 or 2025 award.
- **Regional eligibility went from 10 instruments to 134**, checked against
  where recipients actually are: 98.8% of awards sit inside their scheme's
  registered regions.

## What remains, honestly categorised

### 1. Blocked on a human or a document (4 items)

Not work. Decisions, or dead ends.

- **GBER Art. 107(3)(a) uplift.** Two sources disagree, 25pp against 15pp.
  Recorded as `pp: null`. Needs the Official Journal.
- **One region outlier.** `satr_de_rnd__sa_110716__bezirksregierung_arnsberg`,
  registered for North Rhine-Westphalia, paying into Hamburg, Rheinland-Pfalz
  and Hessen at 59% inside. Someone must read the decision text.
- **Three agencies refuse automated access.** Innovasjon Norge and Bpifrance
  return 403; CDP Venture Capital serves a CAPTCHA. Getting past any means
  impersonating a browser. 14 ambiguous families sit behind them.
- **Two GBER uplifts deliberately unencoded.** Omitting an uplift understates a
  ceiling, and understating is the safe direction.

### 2. Long tail, cosmetic (193 funds, EUR 28.8B)

Funds still sharing a display name: 119 state aid, 74 development banks. This
reads badly and misleads nobody -- the disambiguator works and the verdicts are
correct. Each remaining one costs a bespoke investigation.

**This is where to stop.** Two attempts to clear it produced regressions that had
to be reverted: an Estonian load that merged distinct measures (unnamed funds 22
-> 86 -> 118 before revert), and a naming proposal whose source column was the
funding source rather than the programme, which would have named 22 Estonian
funds "state budget". The marginal fund named is not worth the marginal risk.

### 3. The one structural item left (453 funds, EUR 77.7B)

Every SATR regime's eligibility rules were extracted from exactly ONE document,
and every scheme child inherits the lot. Germany's 81 R&D schemes are all
characterised by a single BMFTR security-research guideline.

It is contained, not solved:

- Displayed criteria are **labelled** ("State aid regime: ...") so a hydrogen
  founder is not shown an automotive-competence clause as a condition on their
  fund.
- Of the 222 borrowed rules that can disqualify, **74 are audited** (activities
  and sector by the recipients audit, regions by `audit_region_claims.py`) and
  **148 are universal GBER conditions** -- undertaking in difficulty, the SME
  definition -- which legitimately bind every scheme under a regime.
- The case register does **not** carry eligibility criteria. Closing this
  properly needs per-scheme documents. That is a project, not a fix.

## The finding that actually matters

The corpus was not the problem this session. **Five times, correct data failed to
reach a founder**, and every one passed the full test suite:

| Defect | Consequence |
|---|---|
| Award medians never written to Postgres | production ranked on the mean on 10 of 12 archetypes |
| Article gates reaching no founder-facing surface | 458 instruments, 0 rows |
| Eight fields dropped between shortlist and memo | typical award, intensity, criteria, structuring notes all invisible |
| A "use client" module pulling `pg` into the browser | production build broken |
| Site JSON never rebuilt by the pipeline | leaderboard disagreed with the corpus |

All five have the same shape: **a hand-maintained list or mapping sitting between
two things that were each individually correct**, where the failure mode is
omission, and omission is legal in both TypeScript and SQL.

Four now have guards: `check_client_boundary.ts`, `rowToEntry.test.ts`, derived
column lists in `migrate_to_postgres.py`, and `build_site_data.py` in the
pipeline. The fifth (article gates reaching nothing) is covered by the evidence
tier contract.

**The memo defect was found by generating a real brief in a browser and reading
it, while 115 tests, 12 archetypes, contracts, payload and cross-store parity
were all green.** No automated check we hold would have caught it. That is the
verification standard worth keeping: for anything founder-facing, render it and
look.

## Recommendation

Stop corpus work. The remaining gains are asymptotic and the last two attempts
cost more than they returned.

The product now has more grounding underneath it than it surfaces. The next
question is retrieval and use -- whether the advisor can reach what is there --
which is where the leverage has moved.

---

## What never makes it into the corpus (measured 2026-08-03)

Asked directly, because the win immediately before this was a field that had
been *staged and never propagated* (`aid_measure_title`). If that happened once
it could happen at the row level too.

**Column level: nothing dead.** Every populated, multi-valued column in the
instrument store is read by some code path.

**Row level: 2,865 of 3,241 notified SA numbers never become an instrument.**
Only 376 do. On its face that is 88% of the register discarded, EUR 88.3B of
aid. It is the right 88%, and the shape of the residue says so:

```
unmatched schemes with 1 recipient      1,318 of 2,865   (46%)
unmatched schemes with >=20 recipients    209 of 2,865   ( 7%)

awards per scheme   matched 868      unmatched 7
```

The head by euros is one-off rescue aid to a single named company -- Uniper
recapitalisation (EUR 34.5B, one award), SEFE (EUR 6.3B, one award) -- and
IPCEIs, which we hold through their own channel rather than a scheme code.
**None of those is a door a founder can walk through.** A register of aid
GRANTED is not a register of schemes OPEN, and the load filter is what
separates them.

### The residue worth a second look

209 schemes have >=20 distinct recipients, which is what a real recurring
scheme looks like. They are concentrated **outside the six target markets** --
Bulgaria, Croatia, Iceland, Cyprus, Finland dominate the top of the list. Two
in-scope exceptions:

```
SA.100189  France   Regime cadre exempte ... 102 recipients  EUR 120M
SA.51198   Germany  Bayerisches Programm     91 recipients   EUR 101M
```

**Verdict: not a corpus gap, and not scheduled.** Two schemes in the markets we
serve is not what stands between a founder and the right fund. Recorded so the
question is not re-opened from scratch, and so that if the market scope ever
widens to the CEE countries, the 209 are the first place to look.
