# wsHG — we CAN read what a founder's money is for from their own words, and it does not pick the right door

**FOR THE OWNER, VERBATIM.** *(headline paragraph written after the funnel arm
returns — see PENDING below)*

---

## 1. What was asked, and what was in the way

`door_separation_wsHA/README.md` §6 found the largest identified separator on
the 287 sibling-miss pairs and could not price it:

```
both doors declare a registered purpose            96   33.4%
  ...their USE OF FUNDS differ                     86   30.0%   <- the founder is asked this on page one
neither door declares one                         176   61.3%
```

The signal is already wired into the product. `objectiveScorer` (shortlist.ts)
multiplies `OBJECTIVE_MATCH = 1.35` into the score inside the within-regime
sibling reassignment — exactly the population wsHA studied. Nothing needed
building.

The blocker was the harness, and it was a real leak constraint.
`founderIntake` pins `useOfFunds` to `["industrial_research",
"experimental_development"]` for all 897 founders and says why: the only
derivation available read the register's `objectives_text`, a statement about
the SCHEME, and `objectiveScorer` ranks on that same field. Deriving it that
way would let the signal grade itself.

**So this workstream derived it from somewhere else: the founder's own
description prose, and nothing else.**

## 2. The leak position, which is the whole game

One `claude-haiku-4-5` call per founder. The model saw `r.description` and
nothing else — not the won fund, not its id, its name, its scheme, its sector
label, not the answer key.

**Constructed, not asserted after the fact.** The request is built from a
single-key object (`promptFor({ description })`), so there is no second field
to forget when somebody adds one to `RecallRow`. A **pre-flight** then searches
every assembled prompt for the row's own `instrument`, `instrumentName`,
`descriptionFrom` and `reattributedFrom` — over the whole population, **before
the first paid token**, because a leak check that fires at founder 54 has
already spent money on 53 and the operator then has an incentive to widen it.

**Why a field derived this way cannot leak, stated so it can be checked.** The
derived value is a pure function of `r.description`, and `r.description` is
already handed to the ranker on every arm of this harness — `semanticFundMatch`
embeds it, `buildInstrumentTableHydrated` and `orderMemoCandidates` receive it.
A post-processing of an input the ranker already reads cannot carry more
information about the answer than that input already carries.
`check_answer_not_reachable.ts` is green, including `PROVE=1`, and it is green
by construction rather than by exemption: it reasons about `lib/`, and these are
harness scripts not reachable from `pipeline.ts`.

### The guard fired twice, and neither hit was argued past

```
leak pre-flight: 897 prompt(s) checked
  887 carry none and are classified; 10 (1.1%) are WITHHELD and keep the pin:
      6  descriptionFrom=eic_accelerator
      2  instrumentName=Demonstrator
      1  descriptionFrom=clean_aviation
      1  descriptionFrom=eic_transition
```

- **`Demonstrator`** is a fund whose display name is one ordinary English noun,
  appearing in two founders' prose about their own work. Almost certainly
  harmless — one common word cannot single out one of 1,088 instruments.
- **`descriptionFrom`** names the regime a rebuilt description was recovered
  from. Usually a *different* regime than the won fund, which is the whole point
  of the rebuild. **Measured rather than assumed: on 31 of the 430 rows that
  carry one, `descriptionFrom` IS the won fund's own ancestor** (`innovate_uk`
  under `innovate_uk__grant_for_r_d_...`). That is precisely the sibling
  relaxation `recallSet.ts` names as the leak.

The first draft of the guard tried to decide which hits were *really* leaks.
That means writing a rule whose job is to let a leak candidate through, and a
workstream that argues its way past its own guard has no guard. **The guard has
no exemption clause: all 10 are withheld from classification and keep the pin.**
It costs 1.1% of coverage and buys a position that needs no argument. Coverage
below is reported over all 897, never over the classified 887 — a coverage
figure must not be flattered by the founders its own guard removed.

## 3. Can a founder's own prose yield the field — YES, on 71.6%

```
COVERAGE, over all 897 founders
  a non-empty answer       642/897  71.6%
    stated                 190       21.2%    the text says what the work or money is for
    inferred               452       50.4%    the text describes the work closely enough
    cannot_tell            245       27.3%    the text says nothing about it
    withheld (leak guard)   10        1.1%
```

**Pre-registered outcome 1: PAYS** (the bar was ≥ 50%).

The classifier was written to make `cannot_tell` easy to choose — "prefer
`cannot_tell` over a guess; choosing a category you are not reading out of the
text makes the answer worse than no answer" — so 71.6% is a floor, not a
stretch. The 27.3% that says nothing is the real shape of this population's
prose: company names, consortium member lists, Polish register dumps
(`Authority: ... | Sector: ... | Form: ...`), and bare titles like
`Workinggrup Standard and IoT-platforms 2021`.

What the money is for, across the 642 answered:

| | n | share of 897 |
|---|--:|--:|
| `experimental_development` | 528 | 58.9% |
| `industrial_research` | 236 | 26.3% |
| `production_capex` | 120 | 13.4% |
| `rd_facilities` | 68 | 7.6% |
| `feasibility_study` | 59 | 6.6% |
| `market_launch` | 50 | 5.6% |
| `ip_protection` | 11 | 1.2% |
| `working_capital` | 7 | 0.8% |

```
  identical to the PIN     196/897  21.9%   <- the funnel arms' own control
  differs from the PIN     446/897  49.7%
```

**Half the population gets a genuinely different answer.** The pin is not a
lucky guess that the derivation merely reproduces.

## 4. Does it pick the won door — NO. It does not beat the constant.

Free and offline, on wsHA's own 287-pair evidence file joined to
`__objectives.json`. The 96/86 split re-derives exactly, and the script refuses
to report if it does not.

`objectiveScorer` awards `OBJECTIVE_MATCH` to a leaf whose registered
`useOfFunds` **overlaps** the founder's answer — overlap, not equality, which is
coarser than it looks and is why the pin already scores both doors of most pairs
the same.

```
WHICH DOOR DOES `objectiveScorer` PREFER, over the 86 pairs

  PIN (what ships today)         won  13  15.1%   shown   8   9.3%   both  65   neither   0   NET +5
  DERIVED (founder's own words)  won  12  14.0%   shown  10  11.6%   both  61   neither   3   NET +2
  ORACLE (best possible)         won  64  74.4%   shown   1   1.2%   both  21   neither   0   NET +63

RESTRICTED to the 58 pairs whose answer ACTUALLY CHANGED

  PIN                            won   9  15.5%   shown   8  13.8%   both  41   neither   0   NET +1
  DERIVED                        won   8  13.8%   shown  10  17.2%   both  37   neither   3   NET -2
```

**Pre-registered outcome 2: SEPARATES BUT DOES NOT BEAT THE CONSTANT.** The
declared bar was "favours the won door more often than the shown door, AND net
> the pin's +5". Net +2 clears zero and misses the pin. On the pairs whose
answer actually changed it is **net −2** — the derivation points at the wrong
door more often than the right one, and the misses concentrate in
`satr_fr_rnd` (6) and `satr_de_rnd` (4).

**The ceiling is the important half of this table, and it cuts the other way
from the result.** An answer *exists* that picks the won door on **64 of 86
(74.4%)**. The pairs are separable; the derived answer is simply not the answer
that separates them. That is a fact about the derivation, not about the doors —
and it means wsHA §6's diagnosis stands: the separator is real, statable and
already collected, and reading it off award-derived prose is not how you get it.

## 5. Does it move the funnel

*(PENDING — the paired two-arm run)*

## 6. The honest bound

*(PENDING)*

---

## Files

- `PREREGISTRATION.md` — committed before the first paid token. What would count
  as the signal paying, what would count as it not paying, and the six
  conditions that void the run.
- `README.md` — this finding.

## Reproduction

- **`website/frontend/scripts/_wshg_useoffunds.ts`** — the derivation. One
  `claude-haiku-4-5` call per founder, leak pre-flight over the whole population
  before the first token, cached by description hash so a re-run is FREE.
  `OUT=/tmp/wshg_uof.json npx tsx scripts/_wshg_useoffunds.ts`
- **`website/frontend/scripts/_wshg_doors.ts`** — §4. Offline, no credentials,
  no model, no database. `UOF=/tmp/wshg_uof.json npx tsx scripts/_wshg_doors.ts`
- **`website/frontend/scripts/measure_funnel.ts`** — §5, via the new
  `USE_OF_FUNDS` arm. `USE_OF_FUNDS=/tmp/wshg_uof.json npm run stages`, ~35 min,
  free. Writes `one_funnel/useoffunds_latest.md` and leaves `latest.md` alone.
