# Workstream L-THIN — EE / CZ / LV, and the register audit

Running file. Written as findings land, not at the end.

## Baseline (2026-08-06, before any write)

`measure_sibling_coverage.ts`, 53 multi-leaf regimes / 797 leaves:

```
ALL THREE J OMITTED   mean class 18.0   uniquely identified 36%   present 80%
eligibility_text over 40 chars: 240 of 1014
  EE 4/61 (7%)   CZ 5/53 (9%)   LV 7/34 (21%)
```

## Finding 1 — most of my population is not in the sibling problem at all

The brief sizes the job as EE 61 / CZ 53 / LV 34 = 148 instruments. Only the
leaves inside a multi-leaf regime can buy sibling separation. Per leaf:

```
EE   14 of 61 instruments are in a multi-leaf regime  (22%)
CZ   38 of 53                                          (71%)
LV    9 of 34                                          (26%)
```

So 61 of my 148 instruments (41%) are on the scoreboard at all; **87 are
singletons where perfect eligibility text moves mean sibling class by exactly
zero.** Compare FR 96%, DE 97%, IT 98%, AT 100%. The thin registers are thin in
a second sense nobody had measured: they are mostly one-of-a-kind instruments.

Also visible in the same cut, and owned by other agents:
- **NO: 1 of 74 instruments is in a multi-leaf regime.** The NO agent's 74-row
  population is ~entirely singletons — the 0% coverage there is nearly all
  off-scoreboard. Worth their knowing before they spend a fetch budget.
- PL 0 of 8, LT 0 of 1.

## Finding 2 — the "regimes" are mostly SATR container rows

The 53 multi-leaf regimes are dominated by synthetic per-country/per-capital-type
SATR parents (`SATR Cz Rnd`, `SATR Lv Equity`, …), not by real regimes with real
delivery bodies. For **CZ and LV, 100% of the multi-leaf population sits under a
SATR container**. The only genuine multi-leaf regimes in my three countries are
Estonian: `EIS (KredEx + Enterprise Estonia)` and `Digitaliseerimise teekaardi
toetus`.

`EIS (KredEx + Enterprise Estonia)` appears as **two separate parent rows**
(3 leaves and 2 leaves) — same regime, split. That is a data defect, not a
naming variant.

## Finding 3 — sqlite and Postgres are in sync (negative result)

`ETL/terms/load_scheme_text.py` writes **sqlite** (`data/db.sqlite`);
`measure_sibling_coverage.ts` reads **Postgres**. That is a real split-brain
risk, so I checked all 1014 instruments both sides:

```
elig_text in BOTH 240   ONLY sqlite 0   ONLY postgres 0
```

No hidden Spanish-style defect here. **But any new write must go to both** —
nothing syncs them automatically. Recording this because all four other agents
are writing the same column.

## Finding 4 — the corpus already holds quoted eligibility text for 156 instruments that have none

`eligibility_gates.quote` and `eligibility_clauses.quote` hold verbatim, cited,
source-attributed text. Instruments with **no** `eligibility_text` but **with**
quoted gate/clause text:

```
EU 65   NO 17   LV 15   EE 12   DK 7   FR 7   IE 6   FI 4   NL 4   DE 3
SE 3    IT 3    CZ 3    ES 3    SK 2 …   (156 total)
```

Spot-checked EE/CZ/LV: the quotes are genuine eligibility prose, `llm_cited` /
`llm_2pass` verified, with `source_file` pointing at a fetched document in
`data/raw/instrument_docs/`. **EU 65 and NO 17 are the largest pools and belong
to the NO/EU agent — they do not need to fetch anything for those.**

## Finding 5 — CZ's low coverage is an ACTIVE-only artefact, not a fetch gap

Joining `data/raw/scheme_enrichment/found_CZ.json` against the DB:

```
CZ (53): HAS text 5 | fetched but SCHEME CLOSED 27 | abstained 5
         usable-but-not-loaded 1 | never targeted 15 (all singletons)
```

**Every one of CZ's 38 multi-leaf leaves was already fetched.** 27 were rejected
by the active-only rule in `load_scheme_text.py` because the underlying call is
expired. CZ coverage cannot be raised by fetching; the text was obtained and
correctly refused.

```
EE (61): HAS 4 | abstained 4 | never targeted 53 (46 singletons, 7 multi-leaf)
LV (34): HAS 7 | abstained 2 | never targeted 25 (ALL singletons)
```

So the sibling-relevant work not yet attempted anywhere in my three countries is
**7 Estonian multi-leaf leaves plus 1 unloaded Czech record**. Everything else is
either done, closed, abstained, or a singleton.
