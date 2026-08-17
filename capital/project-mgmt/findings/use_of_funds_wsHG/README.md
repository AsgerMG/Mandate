# wsHG — we CAN read what a founder's money is for from their own words, and it does not pick the right door

**FOR THE OWNER, VERBATIM.** **Yes, we can tell what a founder's money is for
from their own words — on 71.6% of them — and no, it does not pick the right
door. It cost $1.07.** One cheap classification per founder, reading their
description prose and nothing else, produced a real answer for 642 of 897 and a
*different* answer from the harness's constant for half the population, so this
is not a lucky guess reproducing the pin. But on the 86 pairs wsHA identified —
where the corpus declares a different purpose for the two doors and the founder
is asked exactly that on page one — the derived answer picks the won door 12
times and the wrong door 10, **net +2 against the constant's +5**. On the pairs
whose answer actually changed it is net −2. It is worse than the constant we
already ship. Two things make that a useful result rather than a dead end.
**First, the separator is real and we now know its price**: an answer *exists*
that picks the right door on 64 of those 86, and `feasibility_study` alone is
worth +25 — so wsHA §6's diagnosis stands, and what fails is reading the field
off award prose, not the field. **Second, we found where the signal is being
destroyed, and it is our own arithmetic**: on 28 of the 64 separable pairs the
derived answer *contained* a separating option and scored both doors anyway,
because `objectiveScorer` matches on overlap, so a richer answer separates less.
Changing that rule to "prefer the door that matches more of the answer" takes
the **shipped pin** from +5 to +14 without asking anyone anything — worth more
than the answer change, on this evidence, and priced but deliberately not
applied because `shortlist.ts` belongs to another workstream this hour. **The
one thing this does not say is that founders cannot answer.** A real founder is
asked and states it; these are award-derived descriptions, so 71.6% is a floor
on what a real founder supplies and the 27.3% that says nothing is a fact about
award prose. What it does say firmly: **stop deriving this field from prose**,
and beware `production_capex` — a correct reading of a founder's own words that
points at the wrong door 26 times to 5.

---

```
run                 2026-08-17, isolated worktree wsHG-useoffunds
population          897 founder(s) — held out, described, one per company
draw fingerprint    13cb71cf3a1d1847   <- IDENTICAL to one_funnel/latest.md and to
                    door_separation_wsHA. The same founders, so §4 is comparable
                    with wsHA §6 to the founder rather than to the rounding.
derivation          one claude-haiku-4-5 call per founder, structured output,
                    max_tokens 200, no thinking. Input: r.description ONLY.
cost                $1.068 total — $0.983 the full run, $0.061 an interrupted run
                    the leak pre-flight aborted, $0.024 a 20-founder smoke.
                    NO ranker run, NO memo run, nothing re-bought. Cached by
                    description hash, so re-running the derivation is FREE.
pre-registered      PREREGISTRATION.md, committed 21:31:57, eight minutes before
                    the first paid token (git log is the record, not this line)
reproduce           OUT=/tmp/wshg_uof.json npx tsx scripts/_wshg_useoffunds.ts
                    UOF=/tmp/wshg_uof.json npx tsx scripts/_wshg_doors.ts   (free)
                    USE_OF_FUNDS=/tmp/wshg_uof.json npm run stages          (free, ~2h)
```

**Read-only on the product.** `shortlist.ts`, `objectiveScorer`, `OBJECTIVE_MATCH`,
`memoCandidates.ts` and `caps.ts` are untouched. `founderIntake` still pins the
field. The only shipped-adjacent change is a new default-off arm in
`measure_funnel.ts`, which writes nothing.

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

## 5. Which answer WOULD have separated them, and the trap in the middle

The oracle says an answer exists on 64 of 86. Which one, if a real founder
stated it:

| option | separates | misleads | net |
|---|--:|--:|--:|
| `feasibility_study` | 33 | 8 | **+25** |
| `industrial_research` | 27 | 8 | +19 |
| `rd_facilities` | 30 | 11 | +19 |
| `ip_protection` | 20 | 10 | +10 |
| `experimental_development` | 20 | 17 | +3 |
| `market_launch` | 3 | 14 | −11 |
| `working_capital` | 3 | 14 | −11 |
| `production_capex` | 5 | 26 | **−21** |

**`production_capex` is the trap, and it is why the derivation goes negative.**
The classifier names it for 120 founders, and it is *reading their prose
correctly* — these companies really are building manufacturing capacity. On this
population that answer points at the wrong door 26 times to 5. The derivation is
not wrong about the founder; the answer is wrong about the doors.

### The signal is carried and then thrown away by the scorer

**On 28 of the 64 separable pairs (43.8%) the derived answer CONTAINED a
separating option — and still scored both doors the same.** `objectiveScorer`
matches on **overlap**: any intersection counts. So an answer naming both
`experimental_development` and `production_capex` overlaps a door registering
either one, and a *richer* answer separates *less*. That is arithmetic, not a
fact about founders.

## 6. A proposal, priced and deliberately not applied

**`shortlist.ts` is untouched.** It is another workstream's file this hour, and
the claim in §5 is a claim about `objectiveScorer`'s arithmetic, so it is worth
exactly what the counterfactual that prices it is worth. Two alternative rules,
both computable from what the corpus already holds, scored on the same pairs:

| | overlap (today) | coverage `|∩|` | jaccard `|∩|/|∪|` |
|---|--:|--:|--:|
| derived answer | NET +2 | NET +6 | NET −3 |
| **pin** | NET +5 | **NET +14** | NET +5 |

Two readings, and the second is the one that matters.

1. **The rule change is worth more than the answer change.** Coverage — prefer
   the door that matches *more* of the founder's answer — takes the shipped pin
   from +5 to +14 without asking anyone anything.
2. **Under every rule tested, the pin beats the derived answer.** That makes §4's
   negative a property of the derivation, not of the rule it was scored by.

**What this does NOT license, and the reasons are in the code.**

- It is measured on **86 pairs**, restricted to the pair, model-free. It is a
  lead, not a ranking result.
- `objectiveScorer` normalises with `penalty = OBJECTIVE_MATCH^(-m/k)` over the
  whole candidate group, so changing the match predicate changes `m` and `k` and
  therefore the penalty **for every founder**, not only for these 86.
- `shortlist.ts`'s own comment records that this signal in the row sort cost
  **21 points of exact recall**, because all 421 objective-carrying instruments
  are state-aid schemes and across channels the signal silently becomes a
  channel prior. Within a channel there is no such trade — which is why it lives
  in the sibling reassignment — but a rule change is still not local.
- The honest way to price it is a paired funnel arm, exactly like the one this
  workstream built for the intake answer. **That arm does not exist for the
  scorer.** Building it is the next step, and it is free.

## 7. Does it move the funnel

*(PENDING — the paired two-arm run over all 897, ~2 hours, free, contended with
two other funnel runs on this machine. `USE_OF_FUNDS=/tmp/wshg_uof.json npm run
stages`, draw `13cb71cf3a1d1847` confirmed at start.)*

## 8. The honest bound — what these numbers do and do not license

**They bound derived answers on described founders, and nothing else.**

- **The population.** 897 held-out, *described*, one-per-company founders — 27%
  of the recall set. `recallSet.ts` establishes that no work moves that ceiling:
  532 of 5,729 missing descriptions could be rebuilt, and admitting siblings is
  the only relaxation with any yield, and admitting siblings is the leak. A
  founder with no description is not in any figure here.
- **The prose is not the answer.** These descriptions are project descriptions
  recovered from *other* awards. A real founder is asked "what would this
  funding actually pay for?" on the first page and **states** it. The 71.6%
  coverage is a floor on what a real founder can supply, and the 27.3%
  `cannot_tell` is a fact about award prose, **not** a fact about founders.
  Nothing here says a real founder cannot answer this question.
- **Therefore §4's negative does not retire the route.** It says: *reading this
  field off award-derived prose does not pick the right door.* It does not say
  *the field does not pick the right door* — §5's oracle says the opposite, on
  64 of 86. A ceiling measured on today's derived answers bounds today's
  harness, not the product.
- **What it does license, firmly.** The harness's pin is not costing us
  anything on this population. Replacing it with a derived answer is not an
  improvement and on the changed pairs is a small regression, so **no workstream
  should spend on deriving this field from prose again** without a different
  source. And `production_capex` is a real hazard: a correct answer that points
  the wrong way 5:1.

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
