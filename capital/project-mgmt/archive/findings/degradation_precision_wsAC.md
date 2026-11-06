# The degradation policy withheld 80 rows to catch none of them

Workstream AC, 2026-08-07. Branch `workstream-x-degradation`, with `main`
merged in (the republished 1,084-row snapshot and the 250 leaf cap).
Not merged to main.

Companion to `degradation_policy_wsX.md`, which built the policy and measured
what it cost. This one asks what it BUYS, finds the answer is nothing, and
narrows it until the cost matches.

## The short version

Two changes make the rule precise. Suppression falls from **80 rows to 5**, the
French recall cost falls from **two thirds of the answer key to zero**, and
`check_degradation` stays green.

But the measurement that matters most is not either of those. It is this:

> On the copy the policy was BUILT for — one that predates the call-register
> loads — the policy withholds nothing and 84 closed rows stay offerable. That
> is true of the blunt rule and the precise rule identically.

The rule detects staleness using the very field staleness removes. It is
self-cancelling, and the 73 extra French rows the blunt version withheld were
never buying the protection they were charged for.

## 1. The French table, before and after

778 French holdout pairs; 732 gradable after the answer key's own
offerable-and-reattributed partition; N=600 sampled from those, three seeds.
Every number out of Postgres — `corpus=postgres instruments=1084`, printed on
each run. The ranker is handicapped by exactly the rows the fallback withholds
(`SUPPRESS_IDS_FILE`), so the corpus is live and only the policy differs.

```
                  in pool             EXACT@5             REGIME@5
seed        base  blunt   fine   base  blunt  fine   base  blunt  fine
20260806     98%    31%    98%    17%     8%   17%    79%    27%   79%
7            98%    32%    98%    17%     8%   16%    81%    28%   81%
99           98%    32%    98%    17%     8%   17%    81%    28%   81%

raw counts out of 600
20260806   589    187    589     99      47    99    476    160   476
7          588    192    588    100      45    96    484    170   484
99         589    192    589    103      47   103    483    166   483
```

The precise rule reproduces the baseline **exactly** — same pairs, not just the
same percentage — on seeds 20260806 and 99, and on pool and REGIME@5 for all
three. The one movement is seed 7's EXACT@5, 100 pairs to 96. That is real and
it is the leaf cap, not the policy misfiring: withholding a row frees a slot,
the next Spanish candidate is promoted, and on four pairs it displaces the
French answer from the top five. Four pairs in 600 is inside the ±3.0 half
width and it moves the other way on the other two seeds' noise.

The floors (pool 93 / EXACT@5 22 / REGIME@5 80) are untouched: the FR-only
figures above are a market slice, not the headline run, and nothing French is
withheld.

**Suppression count: 80 → 5.** All five are Spanish; zero are French.

```
                      publishable   withheld            FR    ES
blunt (as built)              736         80            73     7
precise                       809          5             0     5
```

### The archetype tables

Reported because the brief asked for them, and immediately after the recall
numbers because on their own they cannot see any of this. `npx tsx
scripts/check_degradation.ts`, green 2026-08-07:

```
                       shown  (live)   pool  (live)   withheld
Robotics                 6      6      105    103        0
Hardware                 6      6       48     48        0
FinTech (business)       6      6       70     70        0
FinTech (consumer)       6      6       38     38        0
AI B2C software          6      6      123    119        5
AI B2B software          6      6      136    136        0
GovTech                  6      6       87     87        0
Platform                 6      6      123    128        5
Cloud / NeoCloud         6      6       78     78        0
MedTech                  6      6      103    103        0
Life sciences            6      6      135    135        0
AgriTech                 6      6       87     87        0
```

Ten of twelve now lose nothing, against eight before; the two that lose
anything lose five rows each rather than 73. **But a full table still means
nothing here.** It read 6/6 across the board under the blunt rule too, while
that rule was removing 63% of the French answer key. An archetype has no known
right answer, so this table can only ever say the table is full, never that it
is right. It is a floor under a catastrophic regression, not a measure of cost,
and §1 is the measure of cost.

## 2. Against the right referee, the blunt rule caught nothing

The referee is `publishableInstruments()` run against Postgres — the product's
own definition of what may be offered, which is what `check_degradation` uses.
Not `isClosed()` over raw rows: read raw, the successor redirect makes seven
prolonged schemes look dead, and my own first pass fell into exactly that and
reported two false harms before I checked.

Measured 2026-08-07, snapshot `generatedAt` 2026-08-07T17:04:46Z:

```
of the 80 rows the blunt policy withheld
  rows the live register would ALSO refuse                      0
  rows the live register offers (pure collateral)              80

with the policy switched OFF entirely
  rows the snapshot would offer that the live register refuses   0
```

The two stores agree exactly on what may be offered. The suppression caught
nothing because on this corpus there was nothing to catch — and 488 of 778
French holdout answers were inside the set it withheld anyway.

## 3. The rule, stated as a property

Two changes. Both are properties with a test, neither names a register.

### 3a. A register RECORDS windows when most of its rows carry one

> Where a register records application windows, a member with none is a row we
> have not finished loading. Where it does not, a member with none is what the
> register publishes.

The old test was membership — *has any member ever carried a call deadline* —
and one row satisfies it. On this corpus that read two populations as the same
kind of thing:

```
population              rows   carrying a deadline   share
state_aid_satr|ES        174           168           96.6%
national_dev_banks|FR     81             6            7.4%
```

They are not the same kind of thing. `bdns_es_ayudas` IS a register of
convocatorias: a row without a deadline is the 3% we have not loaded.
`ademe_aid` is the French government's `aides-entreprise` catalogue of standing
business aids — sectoral eligibility, open windows — into which six dated
appels à projets happen to fall. Reading those six as evidence about the other
seventy withheld the whole ADEME register, and ADEME is what French founders
actually win.

**A finer key does not exist and was looked for**, because that is the obvious
place to find the bluntness. Every ADEME row hangs off one `ademe_aid` parent
at one depth. The six dated rows are drawn from the *same source pages* as
forty-three undated ones (`.../aides-entreprise/ormat`,
`.../vehicules-lourds-electriques`). No tier, parent, route status, or
provenance field separates a standing aid from an appel à projets. What
separates the two registers is how much of each is dated.

A share is not a tuned constant here: "most" is what "records them" MEANS, and
the corpus reads 96.6% and 7.4% with every other population at zero, so where
exactly the line sits changes no row. `populationRecordsDeadlines().shares()`
reports what it read, so this is checkable rather than trusted. If a population
ever lands near the middle, the answer is to find out what that register is,
not to move the number. It stays derived from the corpus, never listed: a
catalogue whose loader starts extracting windows crosses over on its own.

### 3b. A window we CLEARED is an answer, not a silence

> A row whose window the product emptied on purpose has openness resting on
> what the register said, not on our corpus being silent.

`publishableInstruments()` republishes a superseded registration under its
successor and nulls the end date deliberately — the date belonged to the
registration that expired. The basis stays, and **a basis with no date is a
state no loader writes** (0 of 1,084 rows), so it is the redirect's signature.
Openness then rests on `successor_scheme`, which is on the row.

Reading that as absence withheld two Spanish convocatorias that Postgres
offers. It is the same confusion `check_degradation` documents from the other
side, where reading closure off the raw row called seven redirected schemes
dead — the corpus deliberately clearing a field, mistaken for the corpus not
knowing.

### 3c. The third idea in the brief was already handled

A row whose deadline is far in the future returns `declared_window` and is
confirmed, whatever its basis and however distant the date. Nothing was left
there: all 80 blunt-withheld rows had no date at all.

## 4. THE FINDING THAT MATTERS: the rule is self-cancelling

`check_degradation` runs against the committed snapshot. That snapshot is
republished on every corpus change, so the guard only ever exercises the state
where it cannot fail. `scripts/probe_stale_snapshot.ts` builds the states where
it can — the copy pushed back to shapes this repo has actually been in — and
asks Postgres about the result.

```
copy                                offered  withheld  DEAD OFFERED
current                                 809         5             0
stale (no call deadlines loaded)        812         0            84
no-basis (the 2026-08-06 artifact)      230       381             0
```

**The middle row is the case the policy exists for, and the policy does nothing
in it.** Identically under the blunt membership rule (measured: 812 / 0 / 84)
and the precise proportion rule. The reason is structural:

> `populationRecordsDeadlines` infers "this register publishes deadlines" from
> deadlines PRESENT IN THE COPY. A copy stale enough to be dangerous has none,
> so the rule reads every register as non-recording and withholds nothing.

The only clause that ever caught anything is `basis_not_supplied` — the third
row. That is a test of the copy's SCHEMA, not its currency: it fires because
the 2026-08-06 artifact lacked the column, and it withholds 381 of 814 rows to
do it. That is the "am I on the snapshot" banner the design set out to avoid,
wearing a per-row disguise.

So the guarantee the policy claims is narrower than it sounds. What it actually
holds is: *on a copy current enough for its registers to still be readable, a
row whose window we have not loaded is withheld.* Against a deeply stale copy
the defence is `check_corpus_currency` and `check_corpus_census` — workstream
AA's guards, which are on main and green.

`check_degradation` now prints this on every run rather than leaving the scope
to be inferred from a green line.

## 5. What would make the rule survive staleness

One column, in the ETL, not in the frontend.

The corpus records "this row has no deadline" and "this row is not the kind of
thing that has a deadline" in the same NULL. That conflation is the whole
defect: it forces the rule to reconstruct the second from the population, and
the reconstruction depends on data staleness removes.

If each row carried, at load time, **whether its source publishes an
application window for rows like it** — recorded independently of whether a
value came back — a stale copy would still carry it, and the rule would fire on
exactly the rows at risk however far behind the copy had fallen. It would also
be per row and Rule Zero clean: a statement about what the source publishes,
not an inference from what we happen to hold.

That is the durable fix and it is a corpus change, so it is not this
workstream's to make. Recorded here because it is the only version of this rule
that does what the rule claims.

## 6. Recommendation

**Merge the precise version. It should not have merged blunt.**

* It is strictly better than the blunt rule everywhere measured: same protection
  in all three copy states, 5 withheld instead of 80, and the French answer key
  back to baseline on three seeds.
* `check_degradation` is green with credentials, which is the assertion the
  workstream exists for.
* It costs nothing on the healthy path, where nothing is withheld at all.

Merge it with the claim corrected, though. The line in `degradation_policy_wsX.md`
— "the fallback serves fewer funds, never a dead one" — is not what was built,
and believing it is how 73 French rows got charged to a guarantee that was not
being provided. What was built holds on a copy that is nearly current. On a copy
that is not, currency is the defence, and §5 is what it would take to change
that.

The one thing NOT to do is take §1 as licence to relax the rule further. The
five Spanish rows are the real case: `bdns_es_ayudas` is 97% dated, the register
moved twice on the day this was measured, and a row it has not dated is exactly
the row a copy gets wrong.

## 7. What is red, and whose it is

`npm run check` with credentials, 2026-08-07. Everything this branch touches is
green; the two failures are byte-identical on `main` and were verified there in
the same session.

```
tsc --noEmit                    ok
vitest                          ok   16 files, 209 tests
check_contracts                 ok
check_vocabularies              ok
check_liveness                  ok
check_offer_route               ok   809 publishable, 11 not-an-offer (all sourced)
check_regions                   ok
check_theme_index               ok
check_archetypes                ok
check_corpus_currency           ok   the snapshot and Postgres agree on every
                                     liveness verdict
check_corpus_census             FAIL identical on main. The scheduled ETL failed
                                     at refresh_open_calls.py, its fingerprint
                                     does not match this checkout, and
                                     synthesis.json is stale. Workstream AA.
check_leaf_cap                  ok
check_payload_budget            ok
check_client_boundary           ok
check_dependencies              ok
check_recall_leaks              ok
check_extracted_quotes          ok
check_hydration_parity          FAIL identical on main — the SAME 7 differences
                                     on the same 5 archetypes. Stale
                                     semanticCache.generated.json against live
                                     pgvector. Workstream AA.
check_degradation               ok   with credentials
```

`check_corpus_currency` is now green, which it was not when
`degradation_policy_wsX.md` was written: the 11 IPCEI rows have been retracted
on both stores. That removes one of the two causes §5b of that document
attributed the parity redness to. The other, the stale semantic cache, is still
there and is the whole of it — the failures on this branch and on main name the
same archetypes in the same order, and none of the five is explained by the
rows this policy withholds.

Neither was regenerated here, on purpose: it is AA's artifact, and rebuilding it
inside a policy branch would move every recall number in §1 underneath the
measurement.

## Untouched

The recall set (wsR), the leaf cap (Z), the IPCEI rows (Y2), the publish
pipeline (AA). No floor moved and no guard was lowered: `check_degradation`
gained a scope statement, not a weaker assertion, and the liveness projection to
`ETL/lib/liveness.py` still needs no update — the confidence rule governs the
request path and the ETL does not serve founders. Do not add a sixth copy there.

`SNAPSHOT_FILE` is new and is harness-only. It announces itself on stderr every
time it is used, because a quiet override of which corpus is being read is
exactly how a number gets published about the wrong file.
