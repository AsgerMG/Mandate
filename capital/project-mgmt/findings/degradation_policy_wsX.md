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

**Two things were NOT done and one guard is still red.** See §6 before trusting
anything here.

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

**The founder-visible cost is nevertheless zero.** All 12 archetypes still show
a full table on the fallback path (`npx tsx scripts/check_degradation.ts`):

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

Eight of twelve lose nothing at all. The cost is **pool depth for the two
French-facing archetypes** — 136 candidates down to 64, 146 down to 74 — which
is what the writer reasons over, not what the founder reads. Nobody loses a row
from their table.

If this table ever reads `shown 3 (live 6)`, the policy has started costing what
it was chosen to avoid, and that is the number to watch.

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
*unaccounted* difference rather than as one line among expected ones. Published
row **order** is still asserted exactly, against the live ranking with the
withheld rows removed.

## 6. NOT DONE — read this first

1. **`check_hydration_parity` is RED.** It was already red at my branch point
   (7 differences on the regenerated snapshot: framework citations on 4
   archetypes, gate order on 2, `edf_ra`/`edf_da` and the Joint Undertakings on
   Robotics/AI-B2C). My change adds a second, distinct failure I did not
   resolve: **the published-row assertion is too strict for backfill.**
   Withholding 73 rows frees slots under `POOL_LEAVES_PER_CHANNEL`, so a row at
   rank 7 legitimately becomes rank 6, and `shown(fallback)` then differs from
   `shown(live minus withheld)` by a row that was never in the live pool at all
   (AI B2C: `sns_ju`, `horizon_eu_cl5`; AI B2B: `horizon_eu_cl3`). The Robotics
   `ipcei_*` pool difference looks like the known semantic-float flakiness the
   file's own header documents, not like my change, but I did not confirm that.
   **Do not fix this by deleting the assertion.** The honest repair is to compare
   the fallback's shown rows against the live ranking *re-run with the withheld
   ids removed from consideration*, which needs a suppression override in
   `dump_verdicts.ts`.
2. **The memo was never opened in a browser.** `npm run drive` was not run. The
   notice compiles, type-checks and passes the client-boundary guard, and the
   count reaches it through the same log the funnel uses, but **nobody has
   looked at it on a page.** Given the standing rule, treat the wording and its
   placement as unverified.
3. **Not measured with three seeds.** The archetype set is fixed and the
   suppression is deterministic — it reads no sampler — so seeds do not apply to
   the numbers above. What is *not* measured is the effect of losing half the
   French pool on **EXACT@5 for a French founder on the fallback path**. That
   is a real question and it needs `measure_recall` at n>=600.

## The single most useful thing to do next

**Resolve the parity assertion in §6.1**, because until it is green nobody can
tell a hydration bug from this policy, which is the exact ambiguity the whole
night was spent removing. It is a contained change to `dump_verdicts.ts` plus
the one comparison in `check_hydration_parity.ts`. Do it before looking at the
browser, and before re-deriving any floor.

## Untouched, as instructed

The recall set (wsR), the leaf cap and IPCEI rows (wsW), and every floor. No
guard was lowered. `check_corpus_currency` and `check_liveness` are unchanged
and pass; the liveness projection to `ETL/lib/liveness.py` needs no update,
because the confidence rule governs the request path and the ETL does not serve
founders — do not add a seventh copy there.

One commit on this branch carries K2's regenerated snapshot
(`instrument_terms.json`, `themeIndex.generated.ts`, `coverage_baseline.json`),
taken from the PM's uncommitted `make eligibility` on main so the policy could
be measured against the state the two stores are actually in. Drop that commit
if it lands from K2 first.
