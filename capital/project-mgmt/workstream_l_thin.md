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

## Finding 6 — STOP. EE, CZ and LV are already the best-separated countries in the corpus

This is the finding the brief asked me to surface early if true. It is true.

Per-country mean sibling class **today**, over leaves in multi-leaf regimes:

```
LV   9 leaves   mean class  1.2        FR  128 leaves  mean class 45.4
EE  14 leaves   mean class  1.6        ES   88 leaves  mean class 48.3
CZ  38 leaves   mean class  5.6        SE   62 leaves  mean class 39.1
```

The brief's ordering (DE 72% … CZ 9% EE 7%) is a **coverage** ranking measured
over all instruments including singletons. It is not a **separation** ranking.
EE/CZ/LV score badly on coverage and well on separation, because
`administering_body` + `delivery_region` are already populated for them
(CZ 38/53 and 35/53) and already do the job. Collecting eligibility text buys
almost nothing on top.

Simulating **perfect** eligibility_text per country, baseline mean 17.98:

```
FR -> 10.85  delta 7.12       CZ -> 17.76  delta 0.22
ES -> 12.76  delta 5.22       EE -> 17.97  delta 0.01
SE -> 15.02  delta 2.96       LV -> 17.97  delta 0.01
EU -> 17.45  delta 0.53
GB -> 17.64  delta 0.34
```

Share of total sibling mass: **FR 40.5% + ES 29.6% + SE 16.9% = 87%.**
EE + CZ + LV together = **1.8%**.

**Perfect execution of this workstream as briefed moves the headline number from
18.0 to 17.7.** EE and LV are worth 0.01 each — below the rounding of the
reported figure. The job as scoped cannot pay, so per the brief I am not
completing it, and am redirecting to the audit plus the largest *unowned*
prize.

### What this implies for the programme
The binding constraint is three countries, and two of them (FR, ES) are single
enormous containers: `ADEME (France)` 76 leaves, `Spain BDNS (regional
agencies)` 88 leaves, `Vinnova` 50 leaves. Those three containers hold 214 of
797 leaves and ~87% of the mass. Any agent-hours not spent there are close to
free of effect on the published number.

Note also that ES has **delivery_region populated for 0 of 94** and NO/EU/DK/PL
for 0 as well — for ES that single column is likely cheaper than eligibility
prose and is the reason its class is 48.

### Caveat on the metric
`measure_sibling_coverage.ts` keys on the *string* of eligibility_text, so any
two distinct strings count as separated. It measures whether we wrote something
different down, not whether a founder can choose. Treat "perfect coverage"
deltas above as an upper bound.

## Finding 7 — register-by-register audit sweep (the deliverable)

`inst`=instruments, `leaf`=in a multi-leaf regime, `elig`/`adm`/`reg`=fields
populated, `fetched`/`closed`/`abst` from `data/raw/scheme_enrichment/found_*.json`,
`HARVEST`=has quoted gate/clause text but no `eligibility_text`, `hv-leaf`=those
that are on the scoreboard. Snapshot 2026-08-06; other agents were writing during it.

```
cc   inst leaf elig  adm  reg fetched closed abst HARVEST hv-leaf  owner
??     15   15    0    0    0       0      0    0       0       0  unowned
AT     29   29   21   29    6      29      6    2       2       2  unowned
BE     22   22    7   22   17      22      9    2       2       2  unowned
CZ     53   38    5   38   35      38     27    5       3       2  unowned
DE    121  118   87  118   61     118     25    2       3       2  unowned
DK     11    6    0    3    0       0      0    0       7       3  unowned
EE     61   14    4   12    0       8      3    4      12       4  unowned
ES     94   88    3   24    0      93     87   87       3       1  OWNED
EU     67   52    4    0    0      12      0    0      61      48  OWNED
FI     18   15    5   15   13      15      4    9       4       2  unowned
FR    133  128   24  127   19      52     23    0       7       3  OWNED
GB     21   21    2    4    0       4      1    2       2       2  unowned
GR     15   15    2   15    0      15     11   13       2       2  unowned
HU      8    8    2    8    1       8      3    3       2       2  unowned
IE     18   12    2   12   10      12      6    8       6       2  unowned
IT     88   87   47   87   39      87     48    4       3       2  OWNED
LT      1    0    0    1    0       0      0    0       0       0  unowned
LU      6    6    5    6    5       6      0    1       1       1  unowned
LV     34    9    7    9    0       9      5    2      15       2  unowned
NL     32   30   16   30    6      30     10    3       4       2  unowned
NO     74    1    0    0    0       0      0    0      17       1  OWNED
PL      8    0    6    0    0       8      6    1       0       0  unowned
PT      9    8    1    9    7       9      6    8       2       1  unowned
SE     63   62   10   61    2      12      1    2       3       2  OWNED
SK     13   13    1   13   11      13      9   11       2       2  unowned
```

**What each register already holds, as a result in its own right:**

- **EE** — `data/raw/instrument_docs/eis_*.html` holds 11 fetched Estonian
  Business & Innovation Agency pages, already cut into verified gates. The EE
  register holds *more* than `eligibility_text` shows. But 47 of 61 EE
  instruments are singletons. Riigi Teataja (riigiteataja.ee) was recorded by a
  prior agent as **client-side rendered** — it defeats a non-browser fetch, and
  that is why 4 EE records abstained. Not a block to route around; recorded.
- **CZ** — register is *exhausted*, correctly. All 38 multi-leaf leaves fetched;
  27 refused by the active-only rule. Docs on disk: `cz_tacr_*`, `cz_mpo_twist_*`,
  `cz_act_130_2002_*`, `satr_cz_equity_zakonyprolidi_*`. Nothing left to get.
- **LV** — likumi.lv (the legal-act register) served everything asked of it;
  7 of 9 multi-leaf leaves already have text. The 25 uncovered LV instruments are
  all Altum singletons. `instrument_application.url` for them is only
  `https://altum.lv` / `https://mans.altum.lv` — a portal root, not a scheme page.
- **GB** — the thinnest register in the corpus and the largest *unowned* prize
  (delta 0.34). 17 of its 21 leaves are `innovate_uk__*` **award-category labels**
  ("Study", "Centres", "Collaborative R&D"), derived from UKRI Gateway award data,
  with `administering_body` NULL on all 17. Two are not instruments at all
  ("Department for Science, Innovation & Technology", "Legacy Department of Trade
  & Industry"). Innovate UK publishes eligibility per *competition*, not per
  award category, so only ~5 of the 17 (KTP, SBRI, Investment Accelerator,
  Launchpad, Business Connect) have a stable page to fetch. **Not attempted — out
  of budget.**

## Finding 8 — the harvest that needs no fetching, sized but NOT executed

`eligibility_gates.quote` + `eligibility_clauses.quote` already hold verbatim,
mechanically-verified, source-attributed eligibility prose for **163 instruments
whose `eligibility_text` is empty; 90 of them are on the scoreboard.**
Simulated, against baseline mean 17.89:

```
harvest ALL countries     mean 17.13   delta 0.76   unique 38.4% -> 45.7%
harvest EU + NO only      mean 17.46   delta 0.43
harvest UNOWNED only      mean 17.76   delta 0.13
harvest EE + CZ + LV      mean 17.88   delta 0.01
```

**This is the cheapest unclaimed win in the programme: 0.76 of the 17.9, zero
fetches, zero API spend, no register can block it.** The largest single share is
**EU (48 on-scoreboard instruments, delta 0.43)** and belongs to the NO/EU agent —
they should harvest before fetching anything.

Two caveats for whoever executes it:
1. **Write to sqlite AND Postgres.** `load_scheme_text.py` writes sqlite only;
   the scoreboard reads Postgres. They are in sync today (Finding 3) and nothing
   keeps them so.
2. **Provenance.** Gates carry `source_file` (a local doc in
   `data/raw/instrument_docs/`), not a URL, so `eligibility_source_url` cannot be
   filled honestly from gates alone — `data/raw/instrument_docs/MANIFEST.md` and
   `stage_fetched_text_as_docs.py`'s provenance header are the place to recover it.
   Set `eligibility_confidence` to a value that names the derivation rather than
   implying a fresh fetch.

## Status at hand-in

Out of budget, stopped on instruction. **No database writes were made.** That is
the intended outcome of Finding 6, not an unfinished one: the assignment as
scoped is worth 0.24 of 18.0, and I did not want to spend the remaining budget
buying 0.01 in Estonia. Findings 7 and 8 are the deliverable.

**If one thing is picked up from this file:** run the Finding 8 harvest for EU,
then put every remaining agent-hour on FR, ES and SE, which own 87% of the
sibling mass.
