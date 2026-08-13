# Awaiting your approval

Everything that costs money or is your decision, in one place. Nothing here has
been done. Free work continues meanwhile.

Kept newest-first within each section. When an item is decided, it moves out of
this file and into the commit that acts on it.

---

## Spending

### 1. The blind relevance grader — EUR 1.6

**You approved this before going to sleep; I have parked it anyway**, because
you then said free work only while you are away, and its result reframes the
target rather than unblocking any work. Nothing is waiting on it tonight.

Our answer key is *"the fund that paid this company"* — history, not relevance.
Hand-checking found it arguable on **4 of 9** losses: the population describes a
founder using prose from an award under a *different* regime, so a
multi-project company is described by project X while the key is the fund that
paid for project Y. A founder we score as a miss may have been shown a *better*
fund than the one they happened to win.

The grader is already built and leak-tested (`scripts/_wsdx_grade.ts`,
`check_grader_blind.ts`), reports the historical key and the adviser's judgement
side by side and throws rather than print one alone, and carries a
pre-registered decoy test that discards the metric if it fails.

**Why it matters:** if the key is arguable on a third of cases, 90% against it
is neither reachable nor desirable, and every measurement we take meanwhile
inherits the doubt.

### 2. Widening the shortlist the AI sees, 18 → 40 — EUR 11-13 to confirm

The single largest loss in the product: **28.5 points**. Eighteen was never a
cost or accuracy figure — git shows it was a stopgap for three filters that have
all since moved elsewhere.

Free evidence says widening is right: it costs about **1.3 euro-cents a brief**,
and the old "a longer list makes the model worse" result is contradicted by our
own paid run — on funds sitting at ranks 7-18 the model found them **22 times of
51** where the old arithmetic found them **none**.

The EUR 11-13 buys the confirmation that the model's accuracy does not collapse
on the longer list. **The change itself is free and needs no new code.**

### 3. Sampling the model more than once — **designed, priced, and I recommend NO**

Now measured for free, so this needs your attention only if you disagree with
the recommendation. `findings/consensus_wsGO.md`.

The paid run fired the ranker **twice** per founder on an identical prompt for
50 founders, and both replies are on the tape. That is enough to grade a
2-sample consensus on real replies without a new call. It would have moved the
won fund into the top five on **18 of 50 founders where sampling once managed
21** — a 6-point loss, and the interval rules out the gain the bill needs.

The mechanism, not the luck: a consensus rule can only find the won fund if the
won fund is the more *stable* row across samples. It is the less stable one
(mean rank swing 2.04 against its rivals' 1.49), so averaging demotes it. And
the whole swing set is 9 founders in 50 — even an oracle always taking the
better of the two samples gains 9 points, on a measurement whose noise is 14.

**The price, had it worked:** three samples is 3x the *ranker call* and **+43% a
brief** (EUR 0.290 → EUR 0.415), forever. Note that Sonnet 5's introductory
pricing ends **2026-08-31**, after which the same brief is about EUR 0.62.
Confirming it with a fresh paid run would cost **EUR 63** today, EUR 94 after
that date. **I do not think it is worth spending.**

**Try this instead, and it is free:** 4 of the 148 paid calls were **cut off at
`max_tokens`**. A truncated reply is a degraded reply and a mechanical source of
exactly the variance sampling was meant to average away. Output tokens bill only
when used, so raising the limit costs nothing on the calls that do not need it.
Reducing variance at the source is free; averaging it away costs 43% of every
brief forever.

---

## Your decision, no money involved

### 0. Apply 63 gate-encoding corrections — free, and it is the biggest single fix on the shortlist

**`check_winner_not_gated` goes from 251 wrongful deletions to 14**, against a
ceiling of 207 it has been failing. Nothing else on this list moves it, and no
code change can: wsGR proved the residue is gate encodings, not inheritance.

Every one of the 63 was checked against the funder's own page, and the file
carries the URL, the verbatim quote and the reasoning per row:
`project-mgmt/evidence/wsgu_gate_encoding_corrections_2026-08-13.jsonl`.

**The quote and the requirement never change.** They are the funder's words
and they are right. Only the comparator built from them moves: 48 quarantined
(requirement stays visible, machine verdict stops), 8 re-keyed to the field
their sentence actually turns on, 6 moved to the offer route, 1 narrowed.

Three examples of what is being corrected:

- **Vinnova's aviation programme** says the call is aimed at *"alla
  organisationer inom flygområdet"* and names universities and university
  colleges among its eligible party types. We encode it as
  `sector == mobility_transport`, which deletes GKN Aerospace Sweden and two
  Swedish university colleges from a programme the register says they won.
- **Norges forskningsråd** writes *"Enkeltpersonforetak og
  forskningsorganisasjoner kan ikke søke"* — sole proprietorships and research
  organisations may not apply. We encode it as `borrowerModel not_in
  ['operating']`, and every founder is pinned to `operating`, so it deletes the
  fund from precisely the incorporated companies it exists to admit.
- **Chips JU** publishes an Annex 4 of per-country national conditions. Three
  of its rows — Slovakia, Norway, Poland — are encoded as three
  instrument-wide establishment filters that contradict each other, since no
  applicant is registered in all three.

**What it costs, stated rather than buried.** Quarantining is not free: it
turns "wrongly blocked" into "cannot be judged". The guard's judgeable
population falls from 6,167 pairs to 6,052 against its anti-vacuity floor of
6,000, and 7 of the 45 instruments touched are left with no encoded filter of
their own at all. That is the honest state for those seven — ADEME's forestry
and fuel-station schemes, Vinnova's aviation programme — whose eligibility is
genuinely narrow and genuinely unexpressible in an eleven-value sector list.
They should be RANKED with their requirement shown, not screened out of the
founders who won them. But the headroom above that floor is 52 pairs, so the
next pass of this kind needs a better field to move rules to, not more
quarantine.

**To apply:** `python3 ETL/terms/apply_gate_encoding_corrections.py --apply`,
then publish. It is a dry run without the flag and refuses outright if any row
has drifted; today all 63 match the corpus exactly.


### 4. A permission rule so four corpus corrections can be applied

Blocked by the sandbox, for me and for every agent. Four rows, dry runs clean,
each grounded in the funder's own page — including Fondo di garanzia, where the
**bank** submits rather than the SME. Two eligibility checks stay red until
they land.

### 5. Removing 24 rows that are not funds

wsFX checked every questionable row against the funder's own page and committed
the evidence. The proposal is **24 rows, 3.1% of the pool** — far smaller than
the ~90 I originally described, because the funders said most of those funds are
open. Ireland loses a third of its nine and deserves a second look.

**Blocked on mechanism, not permission:** the removal command selects by parent,
and these rows sit beside live schemes under the same parents, so running it
as-is would take real funds with them.

### 6. Your personal caches — about 7.6 GB

Not project data, so not mine to clear. Disk is at 32 GB free, so there is no
urgency.

- **Spotify, 4.5 GB** — offline downloads re-download; no re-login
- **Chrome page cache, 3.1 GB** — no logins or bookmarks lost; sites reload
  slower once

The 1.7 GB of stale app-updater files you approved is already gone.

---

## Added overnight

### 7. A live prompt change that free work cannot verify

`contracts/brief/02-funds.md` is the memo writer's own system prompt. wsGK
removed one sentence from it:

> *"A row whose honest next step is to wait does not belong in the brief at all."*

That is a **selection** claim sitting in a **writing** contract, and it is false
now — the ranker decides membership, and as of last night nothing in the
writer's reply can change which funds publish. It is replaced by a stronger
instruction closing the same escape: every row you are given has already been
chosen and will publish. The prohibition on hedging itself is kept verbatim.

**Why it is here:** a prompt change alters what the model writes, and the only
way to see the effect is a paid bench run. `bench_report`'s watch-only counter
is the number to read. Nothing is broken meanwhile — the change makes the
contract agree with the code rather than contradict it.

### 8. Corpus corrections wsGL proposed but did not apply

Each is grounded in the funder's own page, evidence committed under
`project-mgmt/evidence/`. None is applied, because each changes what founders
are shown and several change the corpus itself.

- **One gate row costs 16 founders.** `g1-territorio` sits on the Italian
  state-aid parent and all 67 children inherit "the applicant must be in
  Basilicata, Calabria or Sicily" — including Regione Lombardia's own
  programme, whose page requires an operating base in *Lombardy*. Re-encode it
  onto the child it actually describes.
  **NO LONGER URGENT, and still right.** wsGR closed the founder-facing half in
  code: a rule inherited from a row nothing outside our loader names now
  *narrows* a child and can no longer *delete* it. The Lombardy founder is
  offered Lombardy's programme again, and the wrongful deletions the gate screen
  makes fell 274 → 251. What the re-encode still buys is the rule applying with
  full force to the scheme it genuinely describes, where today it applies to
  none of them.
- **Two `borrowerModel` specs are inverted.** "Sole proprietorships are not
  eligible" is encoded so that it excludes every incorporated company — exactly
  whom it exists to admit.
- **Six sector gates encode a consortium rule as an applicant rule**, which is
  how a 6G chip company is blocked from a 6G call.
- **The twenty "closed" funds are mostly between calls.** ADEME is running a
  programme right now against a row we killed in March 2024. The corpus models
  a *call*; the funder runs a *programme*. The right word — `between_calls`,
  offerable with the caveat shown — is already in our own README and nothing
  implements it.
- **Poland needs coverage, not a rename.** All eight rows are our own query
  slugs, and three of the five register names underneath are a 2015 regulation
  and two aid *categories*. Ścieżka SMART, Kredyt technologiczny and sixteen
  regional programmes are absent.
- **`MIN_CHILD_EVENTS = 40` decides whether a fund exists.** It is why Lithuania
  has one row.

### 9. A check that is already failing on main

`check_winner_not_gated` reported **274 wrongful deletions against a ceiling of
207**. Not caused by any of last night's work.

wsGR's inheritance fix took it to **251**, with the judgeable population
untouched at 6,167 pairs, and that is as far as code reaches: the remaining 251
are **308 `sector` blockers and 37 `entityCountries`**, every one of them a gate
encoding rather than a rule. A narrow scheme purpose — "must be a tourism
service provider", "aimed at manufacturing activities" — written as equality
against an eleven-value taxonomy that cannot express it, and one family encoding
its requirement against the catch-all `other` bucket as a *positive* condition
no company can satisfy on purpose.

**The ceiling has not been touched and must not be.** The decision is whether to
fund a pass over the sector encodings in `ETL/terms/encode_gates.py`, which is
where the other 44 points are. Until then the check stays red, and red is the
honest colour: 251 founders would be deleted from a fund they demonstrably won.

### 10. Truncation cannot be proven zero for free — the precondition changed shape

I queued the paid run behind "prove truncation is zero". **That cannot be done
without spending**: truncation is an *output*-token event, and no free run
produces output tokens. The brief was also wrong that the truncating run used an
eighteen-row menu — it was **already at forty**, so there was no growth to blame.

What has been done instead makes the ceiling not bind and makes the binding
**checkable**:

- The output ceiling is doubled (6,144 → 12,288 at the effort the run used),
  matching a ceiling that carried 46 recorded calls with zero truncations.
- **The clock had to move with it**, and this is the sharp part: at the higher
  ceiling the 90-second wall cut the call off *before* the token limit bound —
  and a timeout is counted in a different bucket from a truncation. Fixing one
  defect alone would have hidden it in the quieter counter.
- A new check states the property over the *runs* rather than the values: a
  ceiling measured to bind at an effort may not remain in force there. It was
  proven red on the real record, not a simulation, and any future truncation
  reds the build.

**So the paid run's precondition is now "the ceiling is not the binding
constraint and the check is green", which holds.** The run itself will report
truncation, and if it is non-zero the run is void — as before.

Neither change touches production: the effort lever defaults to `low`.

### 11. `corpus_currency` is red, and it is a real divergence

The check compares the committed snapshot against Postgres. It reports **52
eligibility rules that demand something different across the two**, 36 of them
on funds a founder can be offered, and **15 EU-level programmes** whose country
reads `"EU"` in the snapshot and nothing in Postgres.

The second is **not staleness** — it is an export-time derivation, so
re-exporting will not converge them. Neither was caused by last night's work;
both became visible only when the check was taught to compare rules at all,
which it previously did not.

**It needs a decision:** whether the snapshot or Postgres is right on each, and
whether the export should stop deriving a value the source does not hold.

### 12. One recovered fund is on the wrong axis

`between_calls` correctly offers ADEME's PACTE Entreprises again — its programme
does recur. But the row should not be offered at all: it is an *appel à
manifestation d'intérêt* recruiting delivery bodies to run ADEME's SME advice
network, and the applicant is the delivery body, not a funded company. We hold
it as a €9.0M grant for companies.

The withhold belongs on `route_status = 'none'` with the funder's own URL as its
source. That is a Postgres write, so it is queued rather than applied. **13 of
the 14 founders that change recovered cleanly; this is the 14th.**

Also found and not folded in: **AEI CPP is typed as a loan** while the funder
states *"Subvención y préstamo"* — and this may be systematic across AEI rows.
