# The fallback serves fewer funds, never a dead one

Workstream X, 2026-08-06/07. Branch `workstream-x-degradation`, off `dbfbad58`.

Implements the PM's choice from `corpus_variance_wsS.md` §4: when the live
corpus is unavailable and a request falls back to the committed snapshot,
**serve it, and suppress any row whose open/closed status cannot be confirmed**.

## Status, plainly

**The suppression works end to end and is not half-built.** The rule is in
`lib/intelligence/liveness.ts`, it is applied in the one place that decides what
may be proposed (`publishableInstruments()`), the removal is recorded per
request in the exclusion log, the founder is told the count on both the streamed
preview and the finished brief, and a guard asserts the harm it prevents. Every
one of those links was exercised against the live database tonight.

**2026-08-07 update.** Both merge blockers are closed: the parity assertion is
repaired and proven (§5a, §5b), and the notice has been rendered and looked at,
which found a real print defect (§3a). `check_degradation` is green with
credentials.

**It was not merged, and the reason is §2a, not the blockers.** The measurement
the branch was missing now exists, and it is much worse than this document
previously claimed: on the degraded path a French founder loses the fund they
actually won two thirds of the time. "The founder-visible cost is zero" was an
artifact of measuring table fullness on 12 archetypes that have no right answer.
Whether that trade is still the one to make is a PM decision. See §6 for what
remains red and whose it is.

## 1. The rule, and why it is not "am I on the snapshot"

A global flag condemns all 817 publishable rows for the sake of 80. The question
is asked of each row instead: *what is its openness actually resting on?*

| evidence | what it is | at risk on a copy? |
|---|---|---|
| `declared_window` | an end date that has not passed | no. A store hours behind does not make a future date untrue. |
| `observed_renewal` | notified duration expired, aid granted after it | no. Both facts are on the row. |
| `no_deadline_recorded` | nothing declares an end; openness is inferred from the corpus holding nothing | **yes** |
| `basis_not_supplied` | the store did not carry `scheme_end_date_basis` | **yes, always** |

Only the third is at risk, **and only where the register in question publishes
deadlines at all**. That last clause is what makes the policy affordable, and it
is derived from the corpus, never listed:

> a population that has ever recorded a `call_deadline` records them, so a
> member with none is a row whose window we may simply not have loaded yet.

The unit is `sourceFamilyBucket|country` — the register a row was drawn from,
for one country. Measured over the corpus tonight, **exactly two populations
qualify**: `national_dev_banks|FR` and `state_aid_satr|ES`. Those are precisely
the two the 86 dead calls came from. The moment a call register is loaded for
another country, that population qualifies automatically.

`basis_not_supplied` is the second half and it does the heavy lifting for the
incident itself. The 2026-08-06 snapshot carried **no `schemeEndBasis` key on
any record**, so it could not tell a notified duration from a call deadline and
therefore could not classify the populations either. On that store nothing
undated is confirmable, and all 86 rows are withheld. An absent field reads as
*unconfirmed*, never as *open* — NULL-reads-as-live is the defect that left 80
dead Spanish calls proposable.

**There is no clock in this.** A staleness horizon was designed and rejected: it
makes a CI guard fail on the calendar rather than on the code, which is how a
guard gets loosened. Correctness here does not depend on how fresh the copy is.

## 2. HOW MANY ROWS ARE SUPPRESSED TODAY — the baseline

Read from Railway Postgres and the regenerated snapshot (`generatedAt`
2026-08-06T22:21:04Z, 1,076 records, `schemeEndBasis` present on all of them),
2026-08-06 22:35–22:50Z.

```
corpus                     publishable   suppressed
postgres (live register)          817            0
committed snapshot                737           80     FR 73, ES 7
```

**It is not zero, and that is deliberate — read this before treating it as a
bug.** The PM's brief anticipated "none, because the snapshot is now current".
The clock-free rule declines to make correctness a function of currency, so it
withholds those 80 on a perfectly current snapshot too. They are the rows whose
openness rests on a French or Spanish register having published no deadline,
which is the one inference a copy cannot make safely at any age.

**Re-read 2026-08-07 on the current stores: 817 / 726 / 80, FR 73 ES 7.** The
suppression count is unchanged. The snapshot is 726 rather than 737 because 11
IPCEI rows have since been retracted in it; see §7. Steady state is still
`0 suppressed`, and this is not it — the rule is clock-free, so it withholds
these 80 on a current copy as readily as a stale one.

**All 12 archetypes still show a full table** on the fallback path
(`npx tsx scripts/check_degradation.ts`, green 2026-08-07):

```
                       shown  (live)   pool  (live)   withheld
Robotics                 6      6      105    114        0
Hardware                 6      6       48     48        0
FinTech (business)       6      6       70     70        0
FinTech (consumer)       6      6       38     38        0
AI B2C software          6      6      113    111        7
AI B2B software          6      6       64    136       73
GovTech                  6      6       87     87        0
Platform                 6      6      113    120        7
Cloud / NeoCloud         6      6       89     89        0
MedTech                  6      6      114    114        0
Life sciences            6      6       74    146       73
AgriTech                 6      6       98     98        0
```

Eight of twelve lose nothing at all, and nobody loses a row from their table.

**Do not read that as "the founder-visible cost is zero". It is not, and the
archetype set cannot see the cost.** An earlier draft of this document said it
was zero on exactly this evidence. §2a is the measurement that was missing.

## 2a. WHAT IT COSTS A FRENCH FOUNDER — the number that matters

The archetype table answers "does the table still have six rows". It does. It
cannot answer "are they the right six", because an archetype has no known
right answer. The recall set does: 778 French holdout pairs, each a company and
the fund it actually won.

Measured on the live register with the ranker handicapped by exactly the 80 rows
the fallback withholds — `COUNTRY=FR SPLIT=holdout N=600`, three seeds, every
number out of Postgres (`corpus=postgres instruments=1084`):

```
                    in pool        EXACT@5        REGIME@5
seed        base  policy    base policy     base policy
20260806     98%     31%     16%     7%      78%    25%
7            98%     32%     16%     7%      79%    27%
99           98%     32%     17%     7%      79%    26%
```

**A French founder on the fallback path loses the fund they actually won from
the pool entirely, about two thirds of the time.** EXACT@5 falls 16% to 7% —
it more than halves. REGIME@5, the operational number, falls 79% to 26%.
Identical across three seeds, so this is the policy, not the draw.

The mechanism is not subtle and it is not a ranking effect:

> **488 of the 778 French holdout answers — 63% — are funds this policy
> withholds.** Almost every one is an ADEME aid scheme.

ADEME sits in `national_dev_banks|FR`, which is one of the two populations the
rule identifies as deadline-recording, so the whole register is withheld
wholesale on the fallback. It is also what French founders actually win. The
table stays full because there are plenty of other French rows to fill it; they
are simply not the rows that get won.

**Both things are true at once and neither cancels the other.** The policy does
what it was chosen to do — `check_degradation` is green, no founder on the
fallback is shown a fund the live register calls closed. And on the degraded
path it costs a French founder the right answer roughly two thirds of the time.
"Fewer funds rather than wrong ones" was chosen believing the cost was near
zero. It is not near zero, and this is a PM decision, not an engineering one.

Two things worth weighing before re-deciding:

* **This only bites when the fallback fires.** On Postgres nothing is withheld
  and recall is the baseline column. The cheapest way to pay less for this
  policy is to make the degraded path rarer, not to weaken the policy.
* **The suppression is not evenly distributed and never will be.** It follows
  whichever registers publish deadlines. France and Spain today; the next call
  register loaded joins them automatically.

If the archetype table ever reads `shown 3 (live 6)`, the policy has begun
costing what it was chosen to avoid as well. That is still the number to watch —
it is just no longer the only one.

## 3. What a founder is told

A withheld row must not become a table that is quietly two rows short. One
code-authored sentence, directly under the table heading and above the first
row, because that is where the reader forms the belief it exists to correct:

> *3 funds are not shown: this brief was built from a published copy of the fund
> register rather than the register itself, and their application windows could
> not be confirmed against it. We withhold a fund we cannot confirm is open.*

It is not a "this list may be out of date" banner — a caveat under a table does
not stop anyone applying to the row above it. The count is **per request**, from
the exclusion log, not the corpus total: 73 of tonight's 80 are French, and
telling a German founder that 80 funds are missing would be untrue and
unreadable. Carried on the streamed preview as well as the finished brief; the
preview is on screen for the two to three minutes the writer takes, long enough
to count rows and conclude that is the answer.

### 3a. Opened in a browser, and what looking found

`/brief/preview/withheld` renders the real `Memo` and the real
`InstitutionsTable` through the product's own `withheldNotice()`, at the counts
a real degraded request produces (73 FR, 7 ES) plus 1 for the singular. Nothing
on that page writes the sentence; it asks the product for it. Checked on screen,
on the streamed preview above skeleton rows, and in print.

On screen it was right: under the section heading, above the header row, quiet
left rule, muted serif, no apology and no hedge. Singular and plural both read.

**In print it was not.** The notice was set at `9px` — *under* the 9.5px table it
qualifies, and one pixel above the 8px caveats line at the foot of the page. On
paper the one sentence saying the table is incomplete was typeset as
boilerplate, next to the boilerplate, and a founder skimming the PDF would skim
past it. Now 14px on screen and 11px in print: **never smaller than the rows it
corrects.** Quiet is carried by the muted colour and the hairline rule, never by
making the type smaller than the thing it qualifies.

That defect was invisible to the type checker, the unit tests and the
client-boundary guard, all of which were green. It took a printer.

## 4. The guard that fails on the harm

`scripts/check_degradation.ts`, wired into `npm run check`. It asserts the
outcome, not the mechanism:

> no fund a founder is shown on the fallback corpus may be one the live register
> would withhold

Each archetype's table is built off the snapshot exactly as a degraded request
would build it, then **Postgres is asked about every row it produced**. The live
register is the referee, so the suppression rule cannot mark its own homework.
Testing the mechanism instead ("is the fallback flagged", "does the snapshot
have a basis key") passes on the day the harm finds a new route.

Currently **green**, and it caught a real defect in its own first draft: reading
closure off the raw row called the seven **successor-redirected** schemes dead
calls (SA.64509, SA.110899, SA.106915 among them). Those are registrations the
register says were prolonged under a new SA number, and the product republishes
them under it correctly. A guard that got that wrong would have pushed somebody
to delete the redirect. The referee is now `publishableInstruments()` run
against Postgres — the product's own definition of what may be offered.

`liveness.test.ts` gains nine cases written against the **corpus state that
caused the harm**, not the fixed one, including the exact shape of the 86 and
the "absent key" store. 194 tests pass.

## 5. `check_hydration_parity` was restated, not relaxed

The two paths are now deliberately allowed to differ, in one direction. Bare
equality would fail every run and train people to ignore the file. The corpus
level assertion is **stronger** than what it replaced:

> the funds the fallback may offer must differ from the live set by EXACTLY the
> rows the policy withheld, and by nothing else

A dropped column, a stale export, a half-applied reload now surfaces as an
*unaccounted* difference rather than as one line among expected ones.

### 5a. The backfill assertion — fixed, and why the first version was wrong

Subtracting the withheld ids from the live ranking after the fact was the wrong
comparison, and wrong in the direction that gets a guard deleted. Withholding a
row **frees a slot** under `POOL_LEAVES_PER_CHANNEL`, so the fund behind it is
promoted into the table — and that fund was never in the live pool, so no amount
of subtracting can produce it. Three archetypes read as broken while the policy
worked exactly as designed.

The live arm is now **re-run with those ids out of consideration**
(`SUPPRESS_IDS_FILE` → `__forceSuppressedForParity`), which is the question the
fallback was actually asked. Equality is then exact and asserts the promotions
too — a stronger claim than the subtraction it replaces, not a weaker one. The
third process is not spawned at all when nothing was withheld.

`NO_PG=1` is now honoured, as every other Postgres-touching script in this repo
already does. Before this, `NO_PG=1 npm run check` reached Railway through
`check_hydration_parity` and `check_degradation` — the opposite of what CI says
`NO_PG` is for. Both are unchanged at full strength when run with credentials.

### 5b. The residual red is TWO stale artifacts, and neither is this policy

Proven, not asserted. With the two staleness sources neutralised, **all 12
archetypes agree exactly with the live corpus, top 6 and pool set.** Nothing is
left over for the degradation policy to explain.

1. **Railway Postgres never received the `closed_beneficiary_list` retraction.**
   Postgres holds **zero** rows with that basis; the snapshot holds 11. So the
   live register still offers the IPCEI waves that the product retracted. Every
   `eligibility screen differs (framework citations?)` line is downstream of
   this — each archetype whose pool is set-equal has an **identical** screen, so
   the screen was never an independent fault. Robotics' `edf_ra`/`edf_da` is the
   same thing seen from the other side: 11 IPCEI rows occupy pool slots on
   Postgres that those two take on the snapshot.
2. **`semanticCache.generated.json` is stale against live pgvector.**
   Regenerated, ~996 of 1092 scores move per description and `separation` shifts
   on all 18. This is what remained after the corpora were made set-identical:
   same pool membership, different order, on the five archetypes whose top rows
   the suppression exposes. Swap the fresh cache in and every one of them agrees.

Both are corpus currency, both are already failing `check_corpus_currency` on
main, which names the fix (`make eligibility`, then
`build_instrument_profiles.py run`). **Neither was regenerated here on purpose:**
that is workstream AA's artifact, and rebuilding it inside a policy branch would
move every recall number under the measurement in §2a.

## 6. STILL RED — read this first

`NO_PG=1 npm run check` **does not go green**, and not because of this branch.
It stops in the same two places it stops on main, both in lanes this workstream
was told not to enter:

1. **`check_leaf_cap` exits 1** — `POOL_LEAVES_PER_CHANNEL (90) IS BINDING`,
   `state_aid_satr DE` holds 103. Byte-identical on main. Workstream Z.
2. **`check_corpus_currency` exits 1** — Postgres 1084 vs snapshot 1076, the 11
   IPCEI rows disagreeing on closure, and 8 instruments with no
   `instrument_profiles` row. Identical on main. Workstream AA. This is the same
   drift diagnosed in §5b, already caught by the guard built for it.

Everything else in the suite passes on this branch. The one check whose outcome
this branch changes is `check_hydration_parity`: red on main (where it reached
Postgres even under `NO_PG=1`), and now a clean skip offline / red with
credentials on the two §5b causes alone.

`check_degradation` is **green with credentials** — no founder on the fallback
corpus is offered a fund the live register calls closed. That is the assertion
this whole workstream exists for, and it holds.

## The single most useful thing to do next

**Take the §2a decision.** The engineering is done and its guard is green; what
is not settled is whether losing a French founder the right answer two thirds of
the time on the degraded path is the trade the PM meant to make. Everything
else here is somebody else's queue: republish the corpus (AA) and the two stale
artifacts stop contaminating parity, and the leaf cap is Z's one-line call.

## Untouched, as instructed

The recall set (wsR), the leaf cap (Z), the IPCEI rows (Y2) and the publish
pipeline (AA). No floor was moved and no guard was lowered — the parity
assertion was made stricter, not looser, and the two `NO_PG` skips restore a
repo-wide convention these two files were the only ones breaking. The liveness
projection to `ETL/lib/liveness.py` still needs no update: the confidence rule
governs the request path and the ETL does not serve founders. Do not add a
seventh copy there.

One commit on this branch carries K2's regenerated snapshot
(`instrument_terms.json`, `themeIndex.generated.ts`, `coverage_baseline.json`),
taken from the PM's uncommitted `make eligibility` on main so the policy could
be measured against the state the two stores are actually in. Drop that commit
if it lands from K2 first.
