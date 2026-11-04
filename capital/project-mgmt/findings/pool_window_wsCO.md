# The 8.4% is two harness answers and one hand-written list — and the register says 33 of the rows we call open are shut

**Workstream CO · 2026-08-09 · isolated worktree off `main` at `c7475b52`.**

Reproduce (FREE — one Voyage embed and one Postgres read per pair, two public
open-data GETs, no model calls, nothing written to any store):

```
cd website/frontend
CHANNEL_BACKFILL=off SPLIT=holdout N=250 OUT=/tmp/wsco/holdout_off.json npx tsx scripts/_wsci_autopsy.ts
CHANNEL_BACKFILL=on  SPLIT=holdout N=250 OUT=/tmp/wsco/holdout_on.json  npx tsx scripts/_wsci_autopsy.ts
                                        # and the same two on SPLIT=tune

OUT=/tmp/wsco/register_verdicts.json npx tsx scripts/_wsco_window.ts
npx tsx scripts/check_window_evidence.ts
```

Every replay printed `ranker: all 247 request(s) on EMBEDDING`, and the off-arm
reproduces wsCI/wsCJ/wsCL to the pair: **EXACT@5 26.8% tune, 24.0% holdout.**

---

## 1. THE RECONCILIATION: 3.7% and 8.4% are both right, and neither is the pool gap

The two numbers were never in conflict. They differ in **numerator, denominator
and definition**, all three:

| | wsCI §1 "never in the pool" | wsCK §4 "not in the candidate pool" |
|---|---|---|
| numerator | bucket **1** only — a screen or a gate | bucket **1 + bucket 2** |
| denominator | the 190 **misses** | the 250 **pairs** |
| holdout | 7 / 190 = **3.7%** | 21 / 250 = **8.4%** |

Measured, not argued: the autopsy's own cross tab prints `1 never in the pool 7`
and `2 cut before the table 14`, and 7 + 14 = 21 = 8.4% of 250. On tune it is
1 + 8 = 9 = 3.6%, which is exactly wsCK's 96.4% tune ceiling. The identity closes
on both splits with no residue.

**Bucket 2 is also "not in the pool".** wsCI's label separates a screen from a
cut, which is the right distinction for deciding what to do; the oracle bound
reads `candidateInstrumentIds`, and a leaf cut by `SEL-CAPITAL` is as absent from
that array as one blocked by a country gate. Quoting 3.7% as the pool gap
undercounts it by two thirds; quoting 8.4% as a *product* defect overcounts it,
for the reason in §2.

## 2. THE DISTRIBUTION, and five candidate causes that are ZERO

All 30 not-in-pool pairs across both splits, classified against the corpus:

| cause | holdout | tune | what it is |
|---|--:|--:|---|
| `SEL-CAPITAL` — capital type outside the founder's stated preference | 14 | 8 | **the harness's fixed answer** |
| channel absent — large-ticket lane shut by the founder's ask | 2 | 0 | **the harness's fixed answer** |
| channel absent — channel outside `DEFAULT_INSTRUMENTS` | 5 | 1 | **the product defect** |
| absent from the corpus entirely | 0 | 0 | |
| present but unpublishable | 0 | 0 | |
| filtered as closed | 0 | 0 | |
| semantic retrieval never surfaced it | 0 | 0 | |

Every one of the 30 is `inCorpus=true` and `publishable=true`. Retrieval is not
a filter on this path — every publishable leaf of a selected channel is a
candidate — so "the ranker never surfaced it" is not a way to miss the pool.

**Two thirds of the gap is the measurement, not the product.** The 22
`SEL-CAPITAL` pairs are `tax_credit` (15) and `equity` (7) instruments met by
`CONSTANT_ANSWERS.capitalSought = ["grant","loan"]`, which every replay states on
every founder's behalf. A founder who asks for grants and loans is correctly not
shown a tax credit. The two large-ticket misses are `eib_venture` and
`innovation_fund` against a fixed `b500k_2m5` ask; `eib_venture` opens at €15M+.
wsCK flagged this in one parenthesis — *"part of that 8.4% is the harness's fixed
`capitalSought`"* — and it is in fact 24 of the 30.

**So the pool-side headroom an oracle leaves is 6 pairs of 500, not 42.** The
honest reading of wsCK's 91.6% is that ~1.2% of it is a corpus reach defect and
the rest is the replay answering for the founder.

### Where the pool gap actually is, and it is invisible to EXACT@5

The graded population excludes winners the product may not offer, so the buckets
*cannot* contain them. The answer key's own report is where they are counted:

```
GRADED    6779 (95.5%)
WITHHELD   316 (4.5%)   closed with no successor -- never graded, never gradable
ABSENT       0 (0.0%)
```

**4.5% of the answer key is a fund we could never name**, against 1.2% inside the
graded draw. Any ceiling quoted on the graded population is quoted on a
population already cleaned of the largest pool gap there is.

## 3. THE FIX: the cap decides which channels are considered, not a list

`MIN_CHANNELS_CONSIDERED = 7` reads as a statement about how many channels a
founder's pool may draw on. It was not enforcing that: the only loop that could
fill a free slot iterated `DEFAULT_INSTRUMENTS`, five hand-picked codes of the
corpus's ten. A channel outside it reached a founder only through peer history,
the large-ticket lane, or a thematic top-up with two slots and a similarity
floor. When none fired the channel was absent **while slots sat empty** —
excluded for not being on a list rather than for fitting worse than whatever took
its place.

**The property, with its test for unseen cases.** A free slot is offered to the
channels still outside the pool, ordered by the *same* blended fit
(`blendedFit`, thematic score × corpus prior) that already orders the pool. It
names no channel, country or sector, and the test is direct: give the corpus a
`source_family_bucket` nobody has written code for and it competes for a free
slot on the next request, with no code change. Two refusals stand — a channel an
explicit **channel-stage rule** refused this request does not get a second
chance (read off the log by stage, so a rule added later is honoured without
being named), and the large-ticket channels stay shut when the lane is shut,
because they are surfaced by ASK and not by fit.

Shipped behind `CHANNEL_BACKFILL`, default `on`, `=off` reproduces every number
published before it. An unrecognised value throws.

### Measured, both splits, same draw, same seed, one difference

| | tune | holdout |
|---|--:|--:|
| **EXACT@5** off | 26.8% (67/250) | 24.0% (60/250) |
| **EXACT@5** on | **26.8%** (67/250) | **24.0%** (60/250) |
| paired flips | +0 / −0 | +0 / −0 |
| bucket 1 (never in the pool) | 1 → 1 | **7 → 3** |
| pool ceiling | 96.4% → 96.4% | **91.6% → 93.2%** |
| pairs whose pool grew | 26 / 250 | 32 / 250 |
| won leaf ENTERED the pool | 0 | **4**, at ranks 93, 16, 66, 16 |

**+0.0 on EXACT@5, and it is the eighth route to return it.** The four won leaves
that entered the holdout pool arrived at ranks 93, 16, 66 and 16 — nowhere near
five, which is the same story §2 of wsCI tells: the pool is a correctness floor
for what the *writer* can see, and the top five is a ranking problem.

Concentration, printed beside the gain as required: the four are all
`horizon_eu_partnership`, one regime. That is a fact about one programme and it
is stated as one. What is *not* concentrated is the mechanism — `edf`,
`chips_ju`, `eib` and `innovation_fund` sit under the same defect and would be
reached by the same change the day their ask or their peers change.

### And it closes wsCI §4's first defect outright

`rules.ts` opens "every removal reports here", and a channel that reached none of
the admission routes reported nothing at all. `NO-EVENT/channel-absent` is now
**gone from both splits**: every remaining bucket-1 miss carries a named rule —
`SEL-CHANNEL-CAP` where the cap really bound, and the new
`SEL-CHANNEL-NOT-SELECTED` where the lane was shut. A founder asking "why is
this programme not here" now has an answer in the record.

### WINNER-NOT-BLOCKED, proved rather than argued

Exact, over all 500 pairs of both splits, by diffing the candidate arrays:

```
leaves present in the OFF pool and absent from the ON pool     0
won leaves that LEFT the pool                                  0
EXACT@5 hits lost                                              0
```

Pool membership is **monotone** in the channel set: the backfill only adds to
`codes`, `candidateInstrumentIds` is the unsliced candidate array, and the leaf
cap is per channel, so no leaf can be evicted by another channel's presence. The
zero above is that argument checked rather than asserted.

---

## 4. THE WINDOW: what the registers actually publish

169 rows carry `source_window_policy = publishes_window` and no deadline. They
reach a founder as open because **our copy is silent**, not because their
register is. Per source family, and the split is not the one the column implies:

| object | n | what register record we ingest FOR IT |
|---|--:|---|
| `bdns_es_ayudas__*` (ES) | 88 | aggregates of BDNS **award** records |
| `ademe_aid__*` (FR) | 76 | entries in the TEE **catalogue of aid** |
| `bpifrance_*` (FR) | 4 | award lists |
| `fr_relance_industrie` (FR) | 1 | France Relance |

and 88 further Spanish rows — `bdns_conv_*`, the register's own **convocatoria**
entries — carry a deadline, **all 88 of them, 100%**. When we ingest the record
that has the window field, the window arrives every time.

### The declaration lost its grain, and that is why

`data/reference/source_window_policy.json` was **reconstructed on 2026-08-09**
from the column values in Railway Postgres, after the original was lost with its
worktree. A reconstruction can only recover what the column said, so it is 48
declarations keyed `(source_family_bucket, country)` — no `id`, no `id_prefix`,
no `root_id`, though `assign_source_window_policy.py` still supports all three.
That grain **cannot express wsBE's own discriminator** (*is the object a register
entry for the AID, or an aggregate we built out of AWARDS?*), because one family
in one country holds both kinds: `state_aid_satr/ES` is 88 call entries and 88
award aggregates, and `national_dev_banks/FR` is 76 catalogue entries and 5
award-list rows. The file records the smoothing itself —
`national_dev_banks/FR: {'publishes_no_window': 4, 'publishes_window': 77} ->
publishes_window` — and the four rows it flipped are exactly the four Bpifrance
rows above.

### So the registers were asked. Both are free, public open data.

The BDNS transparency API (`infosubvenciones.es`, the host `extract_bdns.py` and
`fetch_bdns_convocatorias.py` already use) and the TEE catalogue on
data.gouv.fr (the register every ADEME row already cites). No key, no quota, no
charge. `scripts/_wsco_window.ts`, joined on the register's **own titles** and
its own page slugs, never on similarity.

```
                        SPAIN (88)        FRANCE/ADEME (76)
window_open              2   2.3%          39  51.3%
window_passed           27  30.7%           6   7.9%   <- we show these as OPEN
register_states_none     9  10.2%           4   5.3%
no_register_record      50  56.8%          27  35.5%
```

**33 rows carry an application window the official register states HAS CLOSED,
and we put all 33 in front of founders as open.** Not one is a judgement of ours:
each carries the register's own dates, e.g. `conv 617781, abierto=false,
inicio=2022-05-02, fin=2024-04-30` and `cloture=2024-07-09`.

**41 more are stated OPEN by the register.** Loading those dates moves them from
`no_deadline_recorded` to `declared_window` — the assertion becomes evidenced
without withholding anything.

**77 remain unknown, and stay unknown.** A title or slug that no register record
answers to is our join failing *or* the register having withdrawn the object, and
the two are indistinguishable from here. Absence from a catalogue is **weaker
than a stated deadline** and is deliberately not read as `closed` — that is the
IPCEI reversal's lesson, and the honest state for these rows is "we do not know".

### What I did about it

**Nothing was written to Railway.** The 33 closures and the 41 dates are a write
to the source of truth and need the owner's approval; what exists here is the
evidence and the gate.

- `project-mgmt/findings/wsCO_window_register.json` — the per-row register
  verdict, with the register's own dates quoted, committed and not gitignored.
- `scripts/check_window_evidence.ts`, wired into `npm run check`. It **does not
  withhold** — a wrongly-withheld row is a fund a founder never sees, and a
  weekly job once deleted 88 live Spanish funds on every run. Two clauses:
  a **ratchet** (166 publishable rows assert openness on our copy's silence; the
  number may fall and may not rise, so a feed that starts shipping more fails the
  build the day it lands), and **winner-not-blocked** on every proposed
  withhold — it must quote a date the register states, and it must leave at least
  one publishable sibling in its regime so the founder loses a dead edition and
  never the programme.

**Proved to fail rather than left green**, each by making it fire:

```
WINDOW_BASELINE=100         -> FAILED: the unverified-window population GREW: 166 > 100
a verdict with no date      -> FAILED: ... quotes no register date -- that is an inference,
                                       and an inference may not close a row
the evidence file removed   -> Error: ... the evidence a withhold rests on may not be missing
restored                    -> ok
```

Winner-not-blocked, measured over the whole answer key before proposing anything:
all 33 proposed withholds are won leaves covering 396 pairs, and **0 regimes are
emptied** — every one keeps publishable siblings, so a qualifying founder still
sees the programme.

### THE WRITE I WOULD MAKE, for the owner's approval

Three changes, all in `data/reference/source_window_policy.json`, applied by
`assign_source_window_policy.py` (which already supports `id` / `id_prefix` /
`root_id` keys and a `closed_on` field that writes `scheme_end_date` with basis
`call_deadline`). None of it is a hand `UPDATE`: a committed declaration is
re-applied by every load, which is why wsBE put France Relance's closure here.

1. **Restore the grain the reconstruction lost.** `root_id: ademe_aid` →
   `publishes_window` and `root_id: fr_relance_industrie` → `publishes_window`,
   with `national_dev_banks/FR` → `publishes_no_window` underneath. Three
   declarations, and the four Bpifrance rows stop asserting a window their award
   file never had.
2. **The 33 closures**, each as a `closed_on` with the register's date and the
   register response as its `source`.
3. **The 41 stated-open windows**, so their openness rests on a date rather than
   on our silence.

Net: the unverified-window population falls from 166 to **77**, all of them rows
where the honest answer is that we do not know — and none of them asserting
otherwise.

---

## 5. What this means

The pool is not where the fifteen points are, and now it is measured rather than
assumed: **six pairs in five hundred**. wsCK's 8.4% is two thirds an artefact of
answering for the founder, and the part that was real is fixed, is +0.0 on
EXACT@5, and was worth doing anyway — a channel is now excluded by the cap it
claims to be excluded by, and every removal finally reports itself.

The window is the finding that changes what a founder gets. **33 rows we
currently present as open are shut according to the register that publishes
them.** That is not an accuracy problem, it is a founder spending a week on a
door that is not there — and unlike everything else this project has measured
this quarter, the fix is not a model, a question or a ranker. It is loading a
date two public APIs will hand us for free.

## Do not re-propose

- **the pool or the screen as the binding constraint on EXACT@5** — wsCI argued
  it, this measures it: after the fix the pool costs 1.2% of pairs, and the four
  leaves recovered land at ranks 93, 16, 66 and 16;
- **treating `capitalSought` misses as a corpus defect** (§2 — 22 of 30, and the
  replay states the answer, not the founder);
- **reading absence from a catalogue as `closed`** (§4 — 77 rows, and it is the
  IPCEI reversal wearing a different register);
- **a liveness heuristic of any kind.** None was built. Every closure here is a
  date the register states, quoted verbatim, and the check refuses a verdict that
  quotes none.

## What was changed

- `lib/intelligence/shortlist.ts` — the backfill, `CHANNEL_BACKFILL`, and
  `blendedFit` lifted out of the channel sort so the backfill and the ordering
  cannot disagree about what fits better.
- `lib/intelligence/rules.ts` — `SEL-CHANNEL-NOT-SELECTED`; `SEL-CHANNEL-CAP`'s
  `what` no longer says "default channel", because it is no longer only those.
- `scripts/_wsco_window.ts` — the ask, against both official registers.
- `scripts/check_window_evidence.ts` — the ratchet and the winner-not-blocked
  gate, in `npm run check`.
- `scripts/_wsci_autopsy.ts` — the new rule id in its bucket map (the map is a
  total `Record`, so `tsc` refuses a rule nobody has classified).

`npx tsc --noEmit` clean. `python3 -m compileall -q ETL/` clean.
`check_liveness.ts` ok. `check_window_evidence.ts` ok, and proved to fail three
ways. `check_recall_floor.ts` **ok, all floors met**, `ranker: all 297
request(s) on EMBEDDING` — recorded beside this file as
`pool_window_wsCO_floor.txt`. **No floor added, removed, raised or lowered.** No
write to Railway Postgres, no extractor run, no SQLite volume touched.
