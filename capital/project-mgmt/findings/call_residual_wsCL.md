# A body's back catalogue is a portfolio, not a repeat — and the closed call is not the defect

**Workstream CL · 2026-08-09 · isolated worktree off `main` at `7190de32`.**

Reproduce (FREE — one Voyage embed per pair, Postgres reads, one public
open-data GET; no model calls, nothing written):

```
cd website/frontend
SPLIT=tune    N=250 OUT=/tmp/wscl/tune.json    npx tsx scripts/_wsci_autopsy.ts
SPLIT=holdout N=250 OUT=/tmp/wscl/holdout.json npx tsx scripts/_wsci_autopsy.ts

npx tsx scripts/_wscl_recurrence.ts
npx tsx scripts/_wscl_sourcepage.ts
npx tsx scripts/_wscl_official.ts
TUNE=/tmp/wscl/tune.json HOLDOUT=/tmp/wscl/holdout.json \
  npx tsx scripts/_wscl_collapse.ts
```

Both replays printed `ranker: all 247 request(s) on EMBEDDING` and reproduced
wsCI/wsCJ exactly: **EXACT@5 26.8% tune, 24.0% holdout**.

---

## The finding this was given

wsCJ measured that only 7.0% of instruments are territorial siblings and that
**27.1% are one body's own back catalogue of calls** — 88 Spanish rows, 76
ADEME. The proposal under test: a founder does not choose between "ADEME 2023"
and "ADEME 2024", they apply to whichever is open, so collapsing recurring
instances to the live one removes a duplicate rather than information.

**The premise is mostly false, and the defect it points at is a different one.**

## 1. Are they one fund observed many times?

Two independent tests, and they had to be built in this order because each one
alone is wrong in a way the other catches.

**THE NAME TEST, stated as a property.** Two rows are editions of one programme
when (1) they sit in the same regime under the same body — wsCJ's C relation;
(2) their names denote the same thing once every DIGIT RUN is deleted, compared
at weighted Jaccard ≥ θ; and (3) the numeric difference between them is TIME —
different calendar years (an EDITION) or identical digit runs (a DUPLICATE).

Three things in that are load-bearing and each was a wrong version first:

- **The Jaccard is IDF-weighted within the catalogue.** A plain set intersection
  grouped `Horizon EU CL1` with `Horizon EU CL6` at *every* θ including 1.00,
  because once digits and short tokens go, both names are just `horizon`. A
  token every name in a catalogue carries weighs zero, so the catalogue
  discounts its own boilerplate and no stop-word list is needed for a language
  the corpus has not met.
- **Linkage is COMPLETE, not single.** Single linkage chained seven ADEME calls
  into one group whose weakest internal pair scored 0.00: A matched B, B matched
  C, and A and C were declared one fund having never been compared. A collapse
  hides rows, so every member must have been shown to be the same programme as
  every other.
- **Condition (3) exists because (2) deleted the digits.** `CL1` and `CL6`
  differ by a LOT NUMBER, and a lot is not a later edition of another lot.
  A four-digit run in a calendar range is a point in time in every register in
  every language, so this names no country and no feed.

**Result: the back catalogue barely repeats itself.**

```
θ      C rows in a group of ≥2    groups  largest  weakest link  edition/duplicate
0.50     41 / 295   13.9%           17       5        0.64          8 / 9
0.70     36 / 295   12.2%           15       5        0.71          8 / 7
0.90     20 / 295    6.8%            8       4        1.00          6 / 2
```

Concentration, printed beside the number: at θ 0.50 the 41 rows are
`bdns_es_ayudas` 28, `ademe_aid` 11, `horizon_eu_pillar_ii` 2 — so this is
Spanish and French, exactly as warned, and it is a *small* Spanish and French
population.

**The groups that DO form are real.** Checked against
`instrument_profiles.embedding` — built from award titles, which the rule never
sees. Within-group cosine p25/p50/p75 = **0.954 / 0.964 / 0.970**; two rows from
the same catalogue that were NOT grouped = 0.806 / 0.834 / 0.862. The
interquartile ranges do not overlap.

**THE REGISTER'S OWN TEST, which is not a judgement of ours.** Two rows citing
the same page of the official register are one object because the register says
so — the evidence standard `rowIdentity.ts` holds a door to, applied to
identity. 219 rows (20.1% of the corpus) share a page.

**And on its own it is wrong.** Its largest group is 22 rows citing
`dogc.gencat.cat/es/document-del-dogc/index.html` — Catalonia's gazette INDEX.
Those 22 are loans, fair-trade grants, automotive R&D and flood relief, in 22
different regimes. This is fusing a blank `scheme_code` again, wearing a URL.
So the page test carries a guard stated as a property, not as an excluded
domain: **a page shared across catalogues is a directory, not an identity.** It
refuses 31 pages covering 122 rows; 108 rows in 43 groups survive.

The ADEME population is where it pays: **31 of the 76 rows cite a page another
of our rows also cites**, 14 pages cited two or three times each. The name test
found 11.

## 2. THE MEASURED EFFECT OF COLLAPSING: +0.4 tune, +0.0 holdout

### How a historical winner is scored, stated first because it decides everything

The answer key is a register of awards that were MADE, so the leaf a company won
is very often a call that has since shut. Two scorings, both printed, neither
called "the" number:

- **GROUP-CREDIT** — a hit when ANY member of the won leaf's group is among the
  first five distinct groups the shipped order reaches. This is the reading the
  proposal asserts: the founder who won `Torres Quevedo 2022` should be sent to
  `Torres Quevedo 2024`, and sending them there is a correct answer. **This is
  the number quoted below.**
- **STRICT** — a hit only when the surviving representative IS the won leaf. On
  a historical key that is close to a measure of how many winners happened to
  win the most recent edition. It is **+0.0 on every arm of both splits**, and a
  reader who quoted it would conclude collapse hurts for a reason that has
  nothing to do with founders.

### And why GROUP-CREDIT is worthless without a placebo

Collapsing keys can only ever RAISE group-credit EXACT@5, mechanically: five
distinct GROUPS reach further down the ranked pool than five distinct LEAVES, so
the founder is effectively shown more instruments. wsCJ's `+36.0` over-credit
line is that effect at full stretch. So every arm is measured against 25
arbitrary regroupings with the same group-size multiset inside the same
catalogues. **Only the margin over the placebo is evidence.**

| | tune | holdout |
|---|--:|--:|
| base (shipped) | 26.8% | 24.0% |
| name groups, θ 0.50, group-credit | 26.8% (+0.0) | 25.6% (+1.6) |
| — placebo band for that shape | 67–70, median 68 | 60–63, median 60 |
| — **margin over placebo** | **−0.4** | **+1.6** |
| name groups, θ 0.80 | 26.8% (+0.0) | 24.4% (+0.4), margin **0.0** |
| STRICT, every θ | 26.8% (+0.0) | 24.0% (+0.0) |
| register's page alone (index-guarded, unsafe) | 28.8% (+2.0) | 24.4% (+0.4) |
| **CONJUNCTION: page AND name (the safe key)** | **27.2% (+0.4)** | **24.0% (+0.0)** |
| wsCJ over-credit, fuse blank `scheme_code` (not a result) | 62.8% | 56.8% |

**On tune the real grouping scores BELOW its own placebo median.** On holdout it
clears the band by 1.6 points at the loosest θ and by nothing at the tightest.
It does not reproduce across the split, which is this repo's standard, and the
conjunction — the only key where a wrong group needs two independent mistakes —
is +0.4 and +0.0.

**Why it cannot be bigger.** The catalogue is 13.9% recurrence at best, and the
bucket it would have to move is bucket 4: `bdns_es_ayudas` 31 misses and
`ademe_aid` 25 on the tune draw, each sitting in a residual class of 30+.
Removing 41 rows does not bring a class of 30 under five.

### The guard, and it is not green

Built over the whole answer key, not a sample. Two ways this collapse hides a
fund from someone who qualifies: **(a)** every member of a group is closed, so
"collapse to the live instance" deletes the programme; **(b)** the survivor's
matchable gate signature differs from the won edition's, so a founder who
satisfied what they won may be screened out of where they are sent.

```
θ 0.50–0.90   (a) every member closed  0     (b) survivor demands something else  1
              horizon_eu_cbe (2 members, 2 distinct demands)
```

**Proved to fail rather than assumed green:** forced to θ 0.00 the same code
forms 41 groups and flags 24 of them. It throws rather than printing a clean
`0/0` if its population is empty.

## 3. IS A CLOSED INSTANCE OCCUPYING A LIVE SLOT? NO — ZERO, ON BOTH SPLITS

```
                                              tune            holdout
founders shown ≥1 CLOSED row in their five   0/250 (0.0%)    0/250 (0.0%)
slots held by a closed row                   0/1250          0/1250
```

101 rows are closed by the one liveness definition and `publishableInstruments()`
drops all of them before ranking. **Not one `call_deadline` row in the corpus is
in the past** — the Spanish convocatorias that carry deadlines all close between
2026-09 and 2029, and the ones that shut were unpublished. The proposal's second
premise is simply not a live defect.

### The defect that IS there, and it is bigger

169 rows (15.5% of the corpus) have `source_window_policy = publishes_window`
and **no deadline at all**. They are open because our copy is silent, not
because their register is.

```
                                              tune            holdout
founders shown ≥1 UNVERIFIED-WINDOW row      87/250 (34.8%)  98/250 (39.2%)
slots held by one                            235/1250 18.8%  271/1250 21.7%
```

**A fifth of every founder's table.** 88 of the 169 are `bdns_es_ayudas`, 76 are
`ademe_aid`, 5 are Bpifrance.

Rule Zero forbids resolving that from our columns, so **the register was asked**
(`_wscl_official.ts`). The Transition Écologique des Entreprises catalogue is
published as open data on data.gouv.fr by the state startup that runs it — the
same register every ADEME row already cites, in machine-readable form.

```
our ADEME rows whose openness rests on our copy holding no deadline   76
  the register STILL publishes the dispositif                         49  64.5%
  the register NO LONGER publishes it                                 27  35.5%
```

Stated precisely, because the distinction has cost work here: absence from a
live catalogue is **weaker** than a stated deadline and is not `closed` in the
sense `isClosed()` means. It is the register declining to offer something we are
still putting in front of founders. The export itself states `date_cloture` for
only 14 of its 223 dispositifs — which is the register's own shape, and is
exactly why window policy may never be read off loaded values.

## 4. WHAT SEPARATES TWO LIVE CALLS FROM THE SAME BODY: TOPIC, 99.7% OF THE TIME

Every pair of LIVE rows inside one catalogue. "Same subject" is the conjunction
of §2, so a pair called one programme here has two independent reasons to be.

```
catalogues holding more than one live row      92
pairs of live rows inside one catalogue      6912
  separated by SUBJECT — two genuine doors   6893   99.7%
  SAME SUBJECT — one programme, twice          19    0.3%
     ... both carry a declared window            13   68.4%
     ... NEITHER does, so nothing we hold separates them   6   31.6%
```

**A founder looking at two live calls from one body is looking at two different
things.** The back-catalogue framing is a fact about our historical rows, not
about the live table: 19 pairs out of 6,912, and two thirds of those are already
separated by a date we hold.

## The recommendation, plainly

**Do not collapse recurring instances.** This is the seventh route to return
≈ +0.0 — ranking (wsBU), per-fund evidence (wsBY), stage-2 questions (wsCE),
door-level rows (wsCG2), pool and permutation rules (wsCI §3), the address
(wsCJ), and now this. Like wsCJ it did not fail on measurement noise: the
population it targets is 13.9% of the catalogue and 3.8% of the corpus, the
safe key moves EXACT@5 by +0.4/+0.0, and the loose key does not clear its own
placebo on tune.

**Do fix the window.** 35–39% of founders are shown at least one row whose
openness nothing has confirmed, and the register no longer publishes 35.5% of
the ADEME rows in that population. That is not an accuracy problem, it is a
founder sent to a door that is not there. It is also the one thing here with an
official source willing to answer: the TEE catalogue is open data, it names the
dispositif per row, and `_wscl_official.ts` already joins to it.

**Do dedupe on the register's page, but not for EXACT@5.** 31 of 76 ADEME rows
cite a page another of our rows cites. That is a corpus defect worth closing on
its own terms — a founder should not see one dispositif three times — and it is
worth +2.0/+0.4 points, which is not the reason to do it.

## For wsCK, not built here

This workstream implies **one** intake question and it is handed over rather
than designed: nothing in §4 suggests asking a founder anything to separate two
calls from one body, because topic already separates 99.7% of them and topic is
what `sector` and `useOfFunds` already carry. **The question this work does NOT
support is any form of "which year / which round / which call".**

## Do not re-propose, now measured

- collapsing a body's repeated calls to one row for EXACT@5 (§2 — +0.4 tune,
  +0.0 holdout on the safe key, and below its own placebo on tune);
- grouping instruments on a shared source URL alone (§1 — 22 unrelated funds
  behind one gazette index);
- any name-similarity grouping using an unweighted token set or single linkage
  (§1 — both were built, both were wrong, both are recorded in the file);
- treating a closed instance as a live-slot defect (§3 — zero, on both splits).

## What was changed

Nothing a founder sees. No intake field, no flag, no floor, no product code, no
write to Postgres.

- `website/frontend/scripts/_wscl_recurrence.ts` — the property, the token-floor
  measurement, the IDF weighting, complete linkage, and the independent
  profile-embedding check.
- `website/frontend/scripts/_wscl_sourcepage.ts` — the register's identity test
  and its index guard.
- `website/frontend/scripts/_wscl_collapse.ts` — the collapse ladder with both
  scorings and the placebo, the blocked-winner guard, the closed-slot census and
  the live-separation table.
- `website/frontend/scripts/_wscl_official.ts` — the Rule Zero ask, against
  data.gouv.fr. Reads no gitignored data and is not part of `npm run check`.
