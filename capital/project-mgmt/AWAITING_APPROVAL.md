# Awaiting your approval

Everything that costs money or is your decision, in one place. Nothing here has
been done. Free work continues meanwhile.

Kept newest-first within each section. When an item is decided, it moves out of
this file and into the commit that acts on it.

---

## READ THIS FIRST — wsGY changed which of these is worth doing

`project-mgmt/findings/rank_shape_wsGY.md`, 2026-08-13, free, attested, on the
funnel's own draw. Three results, and they re-rank everything below.

1. **The ceiling is not the problem.** A perfect order puts the won fund in six
   rows for **86.3%** of founders against 35.7% today, and all 774 land at
   writer rank 1 — nothing below the pool can lose a correctly ranked answer.
   60% is not blocked by anything structural.
2. **Ranking is not how we take it.** On the 454 misses, the rows we show sit
   within **four percentile points** of the fund they won on every fact we hold
   — size, proximity, recency, award scale, text length. The score is not
   biased against the answer, it is indifferent to it.
3. **63.2% of misses already show a SIBLING of the won fund**, 85.7% the same
   channel. The median failure is the wrong DOOR inside a regime already on the
   page.

**So the item to decide is §0, the 63 gate corrections, and its case is now
much stronger than when it was written.** `leaf_separation_wsAO.md` measured
that gates DO separate siblings — and siblings are where two thirds of the loss
turns out to be. Gate encoding is the one lever we hold that acts on the
failure wsGY identified. Nothing else in this file does.

> **AMENDED 2026-08-17 by measurement, `findings/gate_funnel_wsHD.md`.** The
> paragraph above is right about GATE ENCODING and wrong about THESE 63 ROWS.
> Run on the funnel, paired, they move six rows by **+0.4 points** (35.8% →
> 36.2%, p=0.42) while moving the gate screen by +2.3 points (p<0.001), because
> only **65 of 897 founders won a fund they touch** and 48 of the 63 are
> QUARANTINES — which stop a comparator deleting a row for every founder, not
> just the wronged one, and so lengthen every pool by about four rows. A gate
> change that SEPARATES siblings is the lever wsGY's finding points at; a gate
> change that REMOVES a comparator is its opposite. §0 is still worth applying;
> it is a correctness fix, not the biggest single fix on the shortlist.

**And two spending items below are weaker than their text says:**

- **§2, the EUR 11-13 confirming run on 18 → 40.** wsGY measured the widening's
  deterministic downside at zero and put the model's own ceiling at **71.7%**
  against a whole-pool 86.3%. The run would price something already bounded.
  Not wrong to buy; no longer urgent.
- **§1, the EUR 1.6 grader.** Still the right question about our answer key, and
  still **not on main** — it exists only on `archive/wsDX-relevance-grade`.

*(This block is a reading order, not a decision. Every item below stands as
written and none has been acted on.)*

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

The grader is already built and leak-tested, but **it is not on main** — it
lives on the tag `archive/wsDX-relevance-grade` and nowhere else, which is why
`scripts/_wsdx_grade.ts` and `check_grader_blind.ts` do not exist if you go
looking (`git show archive/wsDX-relevance-grade --stat`). It reports the
historical key and the adviser's judgement
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

### 0. Five more rows named after their granting body, and the two publish steps the rename needs — free, wsHF, 2026-08-17

`project-mgmt/findings/body_named_rows_wsHF.md`. The rename you authorised is
**done in Postgres**: 22 rows under SA.40391, SA.56245 and SA.49781 now carry
the scheme's registered title instead of a tax office's or a ministry's name.
Four things it uncovered are outside what you approved and none has been acted
on.

**a. The property catches 27 rows, not 11.** wsHA's eleven were the rows in its
own working set; the same three SA numbers carry 22 rows corpus-wide, which is
what was written. **Five more carry the identical defect and were left alone:**

| id | shown as | why it is not in the write |
| --- | --- | --- |
| `satr_fr_rnd__sa_59366__ministere_de_la_transition_ecologique_et_solidai` | Ministère de la Transition écologique et solidaire | a **fourth** SA number, not in the finding you approved. The register links it to **two** titled cases (SA.47101, SA.112158) and the rule refuses to guess which is the aid measure. Already withheld from the offerable pool, so no founder sees it today. Needs a person to read both records. |
| `bpifrance_inov` | Bpifrance | no SA number — outside the state-aid register entirely |
| `bpifrance_innovup_leader_idf` | Bpifrance | ditto, and the id says the row is *Innov'up Leader IdF*, so the name is wrong about a thing we already know |
| `innovasjon_norge_loan_risk` | Innovasjon Norge | ditto |
| `innovasjon_norge_loan_lowrisk` | Innovasjon Norge | ditto |

All four national-development-bank rows are **offerable today**. They are a
different repair — a funder page read by a person, per
`project-mgmt/evidence/README.md` — not a register lookup, and Innovasjon Norge
is one of the three agencies `seed_agency_routes.py` records as refusing
automated access.

**b. The committed snapshot needs regenerating.** `website/frontend/public/data/instrument_terms.json`
still carries the twenty-two old names. Postgres is the store the product reads,
so **a founder served today already sees the new titles**; the snapshot is what
CI and `check_*` read, and `check_body_named_rows.ts` therefore stays red until
it is re-exported (`python3 website/build/eligibility_export.py`). That is why
the new check is **not wired into `npm run check`** — wiring a red check in, or
softening it to go green, are both worse than leaving it out and saying so.

**c. `instrument_profiles` is stale for the 22 rows, and this is why the rename
moved the funnel as little as it did.** `profile_text` is built from `name`,
and the shipped ranker is an embedding over that text. Renaming in
`funding_instruments` does not re-embed. Until
`build_instrument_profiles.py` re-runs and the 22 vectors are refreshed, the
ranker still scores these rows on "Finanzamt Aachen-Stadt". Re-embedding 22 rows
is a few cents of Voyage and a publish step, and it is the action that would
actually let the rename change an ordering.

**d. Two register artefacts are now visible on shipped names**, deliberately not
laundered: `Steuerliche Förderung von Forschung und Entwicklung [BMF]` carries
the Commission's issuer annotation, and the Italian title carries their export's
doubled apostrophe (`nell''ambito`). Both classes already existed on shipped
rows named from this same register; cleaning them is a separate change with its
own blast radius, not something to smuggle into a bounded one.


### 0a. Make the corpus of record match what is already shipping — free, ~30 minutes, nothing a founder sees changes either way

`project-mgmt/findings/wsHB_record_divergence/`, 2026-08-17. **Read the reason
this is not urgent first: no founder is affected.** Postgres — the store the
product actually reads — is byte-identical to the laptop on every instrument
measure, and its funds carry all eleven sector families. The gate's DEGRADED
verdict is keeping the record's thinner corpus off the site, which is the gate
working. This item is about closing an exposure, not repairing a live defect.

**The exposure.** The Railway volume is missing the 2026-08-01 sector-label
recovery and the 3,362 eligibility gates encoded since 2026-08-09. Any rebuild
run against it publishes a corpus in which the sector term is *identically zero*
for founders in mobility, materials and space — the term does not degrade, it
stops existing — and the eligibility axis drops from 963 funds to 898.

**Three actions, in increasing cost. None has been performed.**

1. **`railway up` — redeploy the container.** It is running commit `f6ff3957`
   from 2026-08-11 and is therefore grading every weekly census against a
   coverage baseline that was corrected the following morning (`fe75156a`),
   which makes the gate report a 15-row eligibility shortfall where the true one
   is 39. It also means the census's own DRIFTED class is the only thing
   flagging it. Cost: one CLI upload. Risk: the deployed image and HEAD differ
   by six days of ETL changes; read the diff before pushing it at a Sunday cron.
   Command: `python3 ETL/lib/verify_cron.py --deploy`.

2. **Promote ONE table — `company_sector_labels` — to the volume.** 144,493
   rows, primary-keyed on `name_key`, already in `reconcile_stores.py`'s
   IDENTITY map. The container's weekly `classify_taxonomy.py restore` step then
   repairs `companies.sector_top` unaided on the next Sunday, for free, and
   `sectors` returns to 11. Cost: free. Risk: **lowest of the three** — one
   table, no `companies` write, no events touched, and the union never deletes a
   target row. This is the action I would take first.

3. **A full `push_local.py` cycle** to carry the 3,362 gates across and bring
   the record's eligibility axis to ≥963. Cost: free, but it runs 43 extractors.
   Risk: this is the direction that ends in a whole-file upload. It is guarded —
   `push_local.py` downloads a witness copy of the record and refuses through
   `overwrite_gate` if the push would delete a row — and the volume is currently
   ahead by 21 companies, 41 events and €7.95M, so **expect it to refuse** and
   to require `make pull-db` (which unions, safely) first. Do not reach for
   `--force-overwrite`.

**What I did NOT do and why:** no production write of any kind. The volume was
never opened — `pull_db.py` is the only channel to it and it overwrites 645 MB,
so on a machine 3,362 gates ahead it is a demolition, not a read. Every figure
above was derived from the census series, the laptop, and Postgres.

**One correction for whoever owns the sync path.** `reconcile_stores.py`'s
header, `test_overwrite_refusal.py` and `check_corpus_census.ts`'s DIVERGED
message all still say *"both sync paths move the whole file with `--overwrite`"*.
That is no longer true of the pull: `make pull-db` is a side-file fetch plus an
INSERT OR IGNORE union. `make republish` — which `check_corpus_census` prints as
its closing advice — is therefore safe, and the surrounding paragraph currently
reads as though it is not.

### 0. Apply 63 gate-encoding corrections — free, a correctness fix, and NOT a funnel move

**Now measured on the funnel instead of on a guard's counter — 2026-08-17,
`findings/gate_funnel_wsHD.md`, free, paired, nothing written.** Applying them
takes the brief from **35.8% to 36.2% at six rows**: four founders in 897,
inside the run's own noise (exact McNemar p=0.42). What they unambiguously fix
is one row higher: the gate screen stops deleting **21 founders' won fund** and
deletes none of anybody else's, **86.3% → 88.6%, p<0.001**. Nine of those 21
reach six rows, and five other founders are pushed out of six rows by the same
change — quarantining a comparator stops it deleting a row for *every* founder,
so the mean pool grows 79.5 → 83.2 rows for all 828 of them and the extra rows
compete for the same forty-row and eight-row cuts. Two runs 45 minutes apart
agree founder for founder.

**Why the guard's number is so much larger, and both are true.** It counts
7,095 register pairs where one ADEME forestry scheme supplies hundreds; the
funnel counts 897 distinct founders, of whom **65 (7.2%) won a fund any of
these 63 rules touches at all**. 65 is the ceiling on what this proposal can
move at any row. **So apply it because the encodings contradict the funder's own
pages and delete founders who demonstrably won — not because it moves the
product.**

**`check_winner_not_gated` goes from 251 wrongful deletions to 14**, against a
ceiling of 207 it has been failing. Nothing else on this list moves it, and no
code change can: wsGR proved the residue is gate encodings, not inheritance.

**The store holds what the file was written against, checked today**
(`_wshd_pg_drift.ts`, read-only): 62 of the 63 match Postgres exactly, 0
drifted, 0 absent, and one — `chips_ju_kdt_unknown [G1-03]` — **already holds
the proposed comparator in Postgres** though not in the committed snapshot. So
applying the file changes 62 rows, not 63.

**Its case got stronger after it was written, and this is the paragraph to read
if you read one.** wsGY has since measured that **63.2% of the founders we miss
are already looking at a sibling of the fund they would have won** — same
regime, wrong door — and that nothing else we hold about a fund separates the
one they won from the ones we showed. `leaf_separation_wsAO.md` measured that
**gates DO separate siblings**, and that the earlier negative was a harness
handing all 300 founders identical answers. So the encoded gates are the only
lever in this file that acts on the failure that turns out to dominate. A gate
that deletes the right door, or fails to distinguish it from its neighbour, is
the mechanism — not a rounding error on the side.

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

### 13. Promote 3,362 encoded gates to the corpus of record — free, and it is the record's own rule

**The write:** carry the 2026-08-08/09 and 2026-08-12 gate-encoding sessions from
`local`/Postgres onto the Railway volume, by union, never by overwrite —
`ETL/events/load/reconcile_stores.py`. Full working in
`project-mgmt/findings/gate_divergence_wsHC.md`.

**What the state actually is.** Nothing was lost. The volume reads 6,401 gates on
both readings it has ever had, and 6,401 is 33 *above* the state both stores
shared on 2026-08-07. The 7,471 in the guard's output is an eight-day-old laptop
reading; the laptop today holds **9,763**, and so does the Postgres the product
serves from. So `DIVERGED` is right and its direction is right: **3,362 gates
exist only outside the store this repo declares of record.**

**Why the volume cannot fix itself.** `railway_cron.py::STEPS` contains no gate
encoder. `encode_gates.py`, `encode_scheme_text_gates.py`, `load_scheme_text.py`
and `apply_gate_encoding_corrections.py` are not in the weekly run, and the image
is 316 commits old, so it does not even hold the current versions. These rows
exist where they were written and nowhere the cron can reach.

**Cost: zero.** No model call, no re-derivation. The rows already exist; this
copies them. The work they represent was paid for already —
`encoding_method` is `scheme_text_extract` (2,467), `llm_encode` (826),
`llm_orgtype` (44) and `llm_triage` (22), plus 141 `registered_region` rows.

**Risk: low, and bounded by design.** The union path refuses an overwrite
(`reconcile_stores.overwrite_gate`, `test_overwrite_refusal.py`), so a store that
is behind cannot destroy one that is ahead. The volume gains rows and loses none.
The residual risk is the ordinary one of any volume write: it happens while the
weekly cron may run.

**Why it is worth doing rather than leaving.** `corpus_stores.py` makes the
volume of record on one test — *which store, if lost, could not be rebuilt?* For
a third of the gate corpus that argument does not currently hold: the two copies
are a gitignored file on one workstation and a projection that
`migrate_to_postgres.py` truncates and reloads. And the record's own contents are
materially thinner than what the product serves — measured on the local store
with those sessions excluded, **157 of 1,021 publishable funds lose every
evaluable rule**, and sibling groups separated by their gate sets fall from
**40 of 41 to 26 of 41**. That is §0's argument on a different lever: gates are
what separate siblings, and 63.2% of the founders we miss are already shown a
sibling of the fund they would have won.

**It changes nothing a founder sees today** — the brief reads Postgres, which has
all 9,763. This is about where the only durable copy lives.

### 14. Redeploy the ETL image — the container has never published a single guard verdict

**The action:** `python3 ETL/lib/verify_cron.py --deploy` (i.e. `railway up`).
Nothing else. No corpus write.

**What is broken.** `guard_verdicts` holds **783 rows from `local`, 5 from
`proof-local`, 4 from a merge, and zero, ever, from `etl-pipeline`** — across
every guard, not only the census. Meanwhile `corpus_census` has rows #10 and #11
from `etl-pipeline`. The mechanism is in the tree: `guard_verdicts.py` reads
`data/guard_registry.json` at import, `.dockerignore` excludes `data/`, and
`/app/data` is the mounted volume, which holds the corpus and not the registry.
In `publish_corpus_census.main()` that call sits **after** the census INSERT and
**before** the verdict publish, which is exactly the pattern the two tables show.

**What it costs.** `check_corpus_census.ts` documents the verdict feed as the
credential-free door — "how it came to run on every pull request without GitHub
holding a credential to the production database". On that door the newest census
is **#9, a laptop, 2026-08-08**. Every CI run without `DATABASE_URL` has been
judging an eight-day-old reading of a *derived* store and cannot see the corpus
of record at all.

**The fix is already committed and is inert.** `.dockerignore` gains
`!data/guard_registry.json`. The Railway service has `repoTriggers: []`, so
nothing redeploys it on a push; the exception reaches the container only on the
next `railway up`.

**Two more things ride the same deploy**, and both are the reason to do it now
rather than at the next convenient moment:

- **The image is 316 commits and six days behind** (`f6ff3957`, 2026-08-11,
  identified by recomputing `code_fingerprint` over history — wsHB reached the
  same commit independently). Every gate encoder in it is the 2026-08-11 version.
- **It carries a coverage baseline known to be wrong.** Its copy says
  `eligibility 913`; `fe75156a` raised it to 937 the morning after the image was
  built, because thirteen fields were below the mark the corpus had reached.
  The container has been grading the corpus of record against a bar known to be
  too low and publishing the result as a measurement.

**Cost: zero.** A CLI upload. **Risk: the ordinary one** — a deploy while the
Sunday cron may run, and the next run will be the first ever to publish container
verdicts, so expect several to arrive red at once. That is the channel working
for the first time, not a new failure.

**One thing it does NOT fix, and I could not test it.** `data/reference/` is
892 KB of committed input data excluded by the same `data/` pattern, and
`check_offerable_decay.py` — one of the four guards the cron runs — reads
`data/reference/offerable_baseline.json` at module level. The same question is
very likely open for the other cron guards. Worth one pass before the deploy;
`ETL/schema/check_census_imports.py::bar_is_fingerprinted` is the test, pointed
at a wider set of entry points.
