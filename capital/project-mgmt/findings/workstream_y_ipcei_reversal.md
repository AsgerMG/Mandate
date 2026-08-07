# Workstream Y — IPCEI is not closed, and the reason it was marked closed was the wrong axis

Workstream W marked all eleven IPCEI wave leaves non-offerable and reported
"IPCEI is correctly closed". **The row-level outcome was right. The claim was
false, and the mechanism that produced it is the third instance in one night of
the same modelling error.**

This file establishes the truth from official sources first, because that is
where the error came from: every input to W's conclusion was a fact about our
own columns.

---

## 1. What the official sources say

### 1.1 The mechanism is live

The Commission's IPCEI page describes the Joint European Forum for IPCEI
(JEF-IPCEI) as the body where "representatives of Member State authorities and
the Commission identify potential new IPCEI and work on improvements to the
IPCEI process", and points to "IPCEI candidates that are currently in the IPCEI
design phase".
Source: <https://competition-policy.ec.europa.eu/state-aid/ipcei_en>, read
2026-08-07.

The Design Support Hub lists **nine IPCEI candidates in the design phase**, each
with the number of Member States that endorsed it and the date they did:

| IPCEI candidate | MS endorsed | date |
|---|---|---|
| Advanced Semiconductor Technologies | 15 | 27 Nov 2024 |
| Artificial Intelligence | 10 | 27 Nov 2024 |
| Circular Advanced Materials for Clean Technologies | 15 | 27 Nov 2024 |
| Compute Infrastructure Continuum | 10 | 27 Nov 2024 |
| Innovative Nuclear Technologies | 13 | 9 Apr 2025 |
| Biobased Chemicals | 10 | 24 Nov 2025 |
| Biobased Materials | 11 | 24 Nov 2025 |
| Biobased Food and Feed Ingredients | 11 | 24 Nov 2025 |
| Critical Raw Materials | 13 | 20 May 2026 |

Source:
<https://competition-policy.ec.europa.eu/state-aid/ipcei/design-support-hub_en>,
read 2026-08-07. The most recent endorsement is **eleven weeks ago**. A
mechanism that endorsed a new candidate in May 2026 is not closed.

### 1.2 The route in, in the Commission's own words

The same page states the Design Support Hub's job is to "**Actively support
Member States in setting up national calls for expression of interest** in a
coordinated manner including on timing", and that "Member States are in the
driving seat" on project selection.

That is the Commission saying, on the record, that the access route to an IPCEI
is a **national call for expression of interest run by a Member State**. It is
not something we inferred.

### 1.3 The route in, observed at national bodies

Sourced individually, not generalised from one example:

| Country | Body | Call | Deadline | Route |
|---|---|---|---|---|
| EE | Enterprise Estonia (EIS) | IPCEI Biotechnology (bio-based chemicals / materials / food & feed) | **31.08.2026 16:00 — OPEN** | project proposals by email to EIS, IPCEI form for direct partners, GBER form for associated partners |
| IE | Dept. of Enterprise, Tourism & Employment (DETE) | IPCEI AST / AI / CIC | 4 Feb 2026 18:00 | `IPCEI@enterprise.gov.ie` with the IPCEI name as subject |
| DE | BMWE | IPCEI AI (`Interessenbekundungsverfahren`) | 21 Jan 2026 | national EoI, then European matchmaking from 10 Mar 2026 |
| DE | BMWE | IPCEI AST | 15 Jan 2026 | national EoI |
| BE-VL | Catalisti | IPCEI Circular and Advanced Materials | 15 Jun 2026 | Expression of Interest |
| SK | MIRRI | IPCEI AI | Feb 2026 | national EoI |
| LU | MECO | IPCEI AI | May 2026 | national EoI |

Sources: <https://eis.ee/en/services/call-for-expressions-of-interest-ipcei-on-biotechnology/>;
<https://enterprise.gov.ie/en/publications/call-for-expressions-of-interest-ipcei-ast-ai-cic.html>;
<https://www.bundeswirtschaftsministerium.de/Redaktion/DE/Dossier/ipcei-ai.html>;
<https://www.catalisti.be/en/news/open-call-expression-interest-ipcei-circular-and-advanced-materials>;
<https://mirri.gov.sk/wp-content/uploads/2026/02/1_IPCEI_AI_Call.pdf>;
<https://gouvernement.lu/dam-assets/images-documents/actualites/2026/05-mai/13-meco-appel-ipcei-ai/docments/ipcei-ai-call-for-expression-of-interests.pdf>.
All read 2026-08-07.

Ireland's call states the eligibility condition in the form a founder can act
on — the thing the wave decisions never had:

> "Companies and organisations, in particular SMEs (as defined by the European
> Commission), and / or consortia from the fields of AST, AI and CIC, with
> research and production in Ireland that are willing to participate in an
> integrated European project can submit their project proposals."

### 1.4 The full lifecycle, and where each object sits

Germany's IPCEI-AI is the clean worked example, because all three stages are
observable:

1. **Mechanism** — JEF-IPCEI endorses IPCEI AI, 27 Nov 2024. Not applicable to.
2. **National call for expression of interest** — BMWE opens 5 Dec 2025, closes
   21 Jan 2026; ~150 projects pre-selected; European matchmaking 10 Mar 2026.
   *Applicable to, while open.*
3. **National implementing scheme** — BMWE publishes the funding guideline
   (`Förderrichtlinie`) on **27 July 2026**. *Applicable to.*
4. **Commission approval decision** — the wave. Names its beneficiaries. Never
   applicable to.

W's eleven rows are all stage 4. The corpus was holding stage 4 and calling it
a fund.

### 1.5 The Commission's register already distinguishes the two

`data/raw/state_aid_cases/cases.json` holds 531 cached case records from the
Commission's case register, each carrying `caseAidCategory`:

| value | meaning | n |
|---|---|---|
| `CaseTypeS` | Scheme | 527 |
| `CaseTypeIA` | Individual aid | 1 |
| `CaseTypeAH` | Ad hoc aid | 1 |

A **scheme** is, by the register's own construction, a measure under which aid
may be granted to undertakings defined in a general and abstract manner — there
is a route in for someone not yet a beneficiary. **Individual and ad hoc aid**
is aid to named undertakings — there is not.

And the decisive one:

```
SA.112879 -> "Änderung der Förderrichtlinie für die Bundesförderung im Bereich
              Cloud- und Edge-Infrastruktur und -Services im Rahmen des
              IPCEI-CIS [BMWK, IVA3]"   caseAidCategory = ['CaseTypeS']
```

The German IPCEI implementing scheme **is registered as a Scheme**. The wave
decisions are not in the register as schemes at all. The distinction the corpus
needed was published by the source the whole time.

---

## 2. What is true, stated as the corpus should hold it

**IPCEI is a live mechanism with nine candidates in design; a company reaches it
through a national expression-of-interest call run by its own Member State, and
then through that state's national implementing scheme.**

**An approved wave is a Commission decision with a named, closed beneficiary
list. It is a record of aid already allocated. It is evidence, and it is never
an offer.**

Both sentences are true simultaneously. W collapsed them into "IPCEI is closed",
which is neither.

---

## 3. What object belongs in the corpus

Stated as a property, so it decides cases nobody has seen:

> **A row may be proposed to a founder only if it names something the founder
> can apply to: a body that accepts applications, by a route, and — where the
> route is time-boxed — before a date. A row whose identity comes from a record
> of aid already granted is evidence, not an offer, however much money it
> carries.**

Applied here:

- **National expression-of-interest calls and national implementing schemes are
  the offerable object.** They have a body, a route and a deadline. Two are
  already in the corpus and already publishable and neither was ever the
  problem: `satr_de_rnd__sa_112879__...` (the German IPCEI-CIS Förderrichtlinie,
  65 events, notified to 2027-06-29) and `eis_leeuroopalist_huvi_pakk` (Estonia,
  EIS — the same body running the biotech CEI open today).
- **Approved waves are retained as evidence and never proposed.** 1,256 events
  and €131B of award history is the best evidence in the corpus of what IPCEI
  money actually funds and at what size. Deleting it would be a second error.
- **The mechanism is already represented and needs no new row.** `eu_ipcei`
  ("IPCEI eligibility criteria (2021 Communication)") is a framework row: cited
  as criteria, never proposed as a fund. That is exactly the right treatment of
  a mechanism.

So the eleven rows stay non-offerable. **What changes is the reason** — and the
reason is the entire point, because the reason is what generalises.

---

## 4. `closed_beneficiary_list` is on the wrong axis

### 4.1 Where it is applied

Read out of Postgres, 2026-08-07 (`railway`, 1,076 instruments):

```
scheme_end_date_basis      n
(null)                   451
notified_duration        448
call_deadline            166
closed_beneficiary_list   11   <- all eleven IPCEI wave leaves, nothing else
```

**The audit is complete and the population is exactly the eleven rows W wrote.**
Every one of them is an approved IPCEI wave; every one of them is correctly
non-offerable; not one of them is correctly described as *closed*. There is no
other row in the corpus carrying this basis, so there is no third population to
mis-sort.

The two genuine `CaseTypeIA` / `CaseTypeAH` cases in the case cache
(SA.51306, Belgian individual aid to three offshore windfarms; SA.103171,
Italian ad hoc aid to KDT JU 2021 winners) do **not** carry this basis, and
neither is a leaf in the publishable set under those SA numbers. They are the
population the basis was designed for and it was never applied to them.

### 4.2 Why the basis itself encourages the error — it does

`scheme_end_date_basis` answers one question: *what kind of date is this, and
therefore when did the window shut.* Both of its original values are kinds of
date. The third is not a date at all, and W's own comment says so: "This one
answers a prior question — there was never a window."

A field whose documented purpose is "which register supplied `scheme_end_date`,
and therefore what it means" cannot carry a value that means "this row has no
`scheme_end_date` and never could". The consequence is not cosmetic:

1. **It makes the corpus assert something false.** Anything reading the liveness
   axis now reads "IPCEI: closed". That sentence went into a commit message, a
   findings file and a report to the PM, and it is wrong.
2. **It hides the modelling error it was invented to paper over.** Marking a
   non-fund closed makes the symptom vanish and leaves a non-fund in the corpus,
   which is precisely what the GB `grantCategory` finding warned against six
   hours earlier in the same night.
3. **It forced `isClosed()` to test the basis before the date**, i.e. to special-
   case the one value that is not a date, inside the function whose entire
   contract is date interpretation.
4. **It is not durable.** `scheme_end_date_basis` is in `BUILT_COLUMNS` in
   `ETL/events/load/populate_funding_instruments.py`, which does
   `DELETE FROM funding_instruments` and preserves only the columns it does *not*
   build. The next instrument rebuild wipes the basis on all eleven rows and
   **silently republishes them as offerable** — with no end date and no basis
   they read as open. W's retraction of the eligibility *text* survives a rebuild
   (those columns are preserved by difference); W's retraction of
   *offerability* does not. This was never going to hold.
5. **It shipped a cross-language divergence.** W added the constant to
   `ETL/lib/liveness.py` and to the generated `closedSql`, but the row-wise
   Python `is_closed()` was never taught the third basis and still returns
   `False` for a `closed_beneficiary_list` row with no date. The two languages
   disagree today. `check_liveness.ts` did not catch it because it checks the
   projection is fresh, not that the row-wise implementations agree.

### 4.3 The replacement

Move it off the liveness axis onto its own, where the question is *kind*, not
*time*: `route_status` on `funding_instruments`, deliberately **not** in
`BUILT_COLUMNS` so it is preserved by difference across every rebuild.

| value | meaning |
|---|---|
| `attested` | an application route is recorded from an official source |
| `unrecorded` | believed to be an offer; the route has not been sourced yet |
| `none` | the official source establishes there is no route in: aid fixed to a named beneficiary list, or a row whose identity is a register artefact rather than an offer |

`none` requires a source. A row is not declared a non-fund by assertion.

`isClosed()` goes back to being purely about dates, which removes the special
case, removes the false assertion, and removes the Python divergence by deleting
the value the Python was never taught.

---


## 5. Independent re-verification of §1 (this section written by the successor)

The predecessor died on a spend limit mid-task. Everything below was re-checked
rather than inherited, because a workstream that exists to correct a claim made
without a fetch cannot itself pass a claim along unfetched.

Re-fetched 2026-08-07 and **confirmed verbatim**:

- The Design Support Hub lists **exactly the nine candidates** in §1.1 with the
  same endorsement counts and dates, Critical Raw Materials most recent at
  **13 Member States, 20 May 2026**.
- The Hub's role: *"Actively support Member States in setting up national calls
  for expression of interest in a coordinated manner including on timing"*, and
  *"IPCEI is a State aid tool and Member States are in the driving seat"* — it
  *"will neither replace national processes nor Member States' ownership of the
  process, including selecting individual projects."*
- JEF-IPCEI is where *"representatives of Member State authorities and the
  Commission identify potential new IPCEI"*.
- Estonia's call is **open**: proposals to EIS *"until 31.08.2026 at 16.00"*,
  from *"Companies and organisations – primarily SMEs … with research or
  production activities in Estonia"*, by email, with separate forms for direct,
  associated and indirect partners.

**A founder can act on IPCEI today.** That is the fact W's conclusion denied.

One addition the predecessor did not have. The Commission's approved-IPCEI page
states there are **"eleven integrated IPCEIs approved so far"** — and the corpus
holds exactly eleven wave rows. The population under audit is not a sample of
the approved waves, it *is* the approved waves, which is what lets §6 give a
per-row verdict without reading eleven decisions.

## 6. The `closed_beneficiary_list` audit, closed

**The basis no longer exists.** Postgres, 2026-08-07 (`railway`):

```
scheme_end_date_basis      n
(null)                   462
notified_duration        448
call_deadline            166
closed_beneficiary_list    0   <- removed
```

Every remaining textual reference in the repo is either prose explaining the
history or `liveness.test.ts` asserting the value is **no longer** special-cased.
No live consumer reads it.

**Population, with verdicts.** All eleven, read out of Postgres:

| row | events | first→last year | verdict |
|---|--:|---|---|
| `ipcei_micro` | 108 | 2018→2018 | approved wave — evidence, never an offer |
| `ipcei_batteries` | 92 | 2019→2019 | ″ |
| `ipcei_eubatin` | 156 | 2021→2021 | ″ |
| `ipcei_hy2tech` | 164 | 2022→2022 | ″ |
| `ipcei_hy2use` | 124 | 2022→2022 | ″ |
| `ipcei_cloud` | 76 | 2023→2023 | ″ |
| `ipcei_mect` | 268 | 2023→2023 | ″ |
| `ipcei_hy2infra` | 124 | 2024→2024 | ″ |
| `ipcei_hy2move` | 52 | 2024→2024 | ″ |
| `ipcei_med4cure` | 56 | 2024→2024 | ″ |
| `ipcei_tech4cure` | 36 | 2025→2025 | ″ |

**None is flagged as unsourceable.** All eleven carry the Design Support Hub URL
in `route_status_source`, and the count reconciles to the Commission's own
"eleven integrated IPCEIs approved so far".

A corroborating detail nobody had noticed: **`first_year == last_year` on all
eleven.** A scheme disburses over its notified duration; a decision has a date.
The corpus was recording the date of an approval and reading it as the lifetime
of a fund. It is corpus-internal, so it is evidence and not the verdict — the
verdict is the Commission's page — but it is the cheapest available tell.

**The basis was sound for a population it was never applied to.** The case cache
(`data/raw/state_aid_cases/cases.json`, 531 cases) classifies **527 as
`CaseTypeS` (scheme), one `CaseTypeIA`, one `CaseTypeAH`, two uncategorised** —
verified directly. No IPCEI wave decision appears in it at all, which is the
register agreeing that a wave is not a scheme.

### 6.1 One live finding the audit turned up, NOT actioned

```
satr_be_rnd__sa_51306__energie   PUBLISHABLE TODAY
  "Individual aid to 3 offshore windfarm projects
   (Mermaid, Seastar and Northwester2) - EFSI case"
  route_status = (null)   scheme_end_date = none   application_url = none
```

The Commission's register classifies **SA.51306 as `CaseTypeIA` — individual
aid**, and the row's own name states it is aid to three named projects. It is in
the publishable set and can be proposed to a founder as something to apply to.
It is the population `closed_beneficiary_list` was designed for, and it was
never touched.

**Deliberately left as found**, for two reasons. The register's category is a
real official source and probably sufficient, but I have not read the decision
itself, and this row would be a claim about the world made on one field.
Second, the corpus was being written by another workstream during this session
(§9) and racing a one-row write at the end of a session is how three pieces of
work have already been lost here.

**`mark_offer_route.py` cannot currently express this edit**, and that is by
design worth revisiting. Its scope flag is `--parent`, required, on the
reasoning that "every leaf under this regime is a decision, not an offer" is a
claim a reader can check whereas a list of ids is the same edit with the
reasoning left out. That is right for a regime. It has no way to say **"this one
row, for this one sourced reason"**, and individual aid is by definition a
one-row population — `--parent satr_be_rnd` would sweep every Belgian SATR R&D
row with it.

So whoever actions this needs to add a single-row scope that still **requires
`--source`**, which is the property that matters. The `--parent` requirement was
protecting against unreasoned bulk edits; a sourced single-row edit is not that.

It is already counted inside `state_aid_satr`'s routeless ceiling of 32, so the
ratchet is holding the line on it either way.

### 6.2 The two IPCEI quotations encoded as `filter` gates — closed

Four, not two. Applied in **both stores**, verified by reading each back:

| instrument | gate | was | now |
|---|---|---|---|
| `ipcei_hy2infra` | `G1-01` | `filter` on nexus | `programme_fact` |
| `ipcei_batteries` | `G1-02` | `filter` on nexus | `programme_fact` |
| `ipcei_med4cure` | `g1-nexus-participants` | `filter`, **`llm_2pass`, resolved onto `entityCountries`** | `programme_fact` |
| `ipcei_micro` | `G1-03` | already `programme_fact` | recorded for completeness |

`ipcei_med4cure/g1-nexus-participants` was the dangerous one: assertable *and*
evaluable against a founder's country, so it could have decided a verdict. It
also fails pertinence independently — its quote is *"This section briefly
describes the 14 direct participants involved in the IPCEI Med4Cure"*, a section
header, which does not state the requirement recorded above it.

`apply_gate_role_overrides.py` now writes **Postgres as well as SQLite** and
raises if `DATABASE_URL` is unset, because a demotion that lands only in SQLite
is not a demotion: the product reads Postgres and the gate keeps deciding.

**Verified reach, which is the assertion that actually matters:** no selectivity
gate reaches any publishable row, tested as a *property* over gate text rather
than by id, and including gates inherited from the `ipcei` rollup —
`0 publishable rows filtering on an already-chosen beneficiary list`. Belt and
braces: the four are inert both because the rows are withheld and because the
role is demoted, so re-opening a row cannot re-arm them.

## 7. The test: `check_offer_route.ts`, in `npm run check`

The predecessor's findings described this check as existing. **It did not** —
no such file was ever written. It exists now.

Four assertions:

1. `data/offer_route.json` is not stale (the ETL judges by the product's rule).
2. **No publishable leaf carries `route_status = 'none'`** — fix the corpus, do
   not hide the row.
3. **Every `route_status = 'none'` cites a source.** The asymmetry is the whole
   lesson: `unrecorded` costs nothing and needs nothing, because a gap in our
   collection is not a claim; `none` is a claim about the world.
4. **Ratchet, per source family:** publishable leaves with no recorded route may
   not increase.

### 7.1 The load-bearing design decision

`hasRecordedRoute()` counts an application URL, a dated window from an official
register, or a hand-attested route. It deliberately **excludes
`administering_body`**, and a unit test pins that.

`administering_body` is derived from award attribution — *who paid*. Every row
built out of a register of aid already granted therefore has one **by
construction**. Counting it would make the test structurally blind to the exact
population it exists to catch: **an artefact of a payment record always has a
payer and never has an application desk.** (The eleven IPCEI rows happen to
carry no body either, verified in Postgres. That is luck, and building the test
on it would be building on an accident.)

### 7.2 Why a ratchet and not a floor of zero

379 of 806 publishable rows have no recorded route today and nearly all are real
schemes. **A missing route is a gap in our collection, not a fact about the
world** — the sentence this whole workstream exists to defend. A check demanding
zero would delete hundreds of live funds. What a ratchet forbids is *adding
more*, which is precisely what an extractor that manufactures rows does.

Per *family*, not corpus-wide, because a corpus-wide total is where sixteen rows
hide: GB's sixteen moved no aggregate anyone was watching and were found by a
human reading names, hours and two incidents later.

### 7.3 It was replayed against both real incidents, and both fail the build

Not a fixture — the actual events, replayed into the snapshot:

```
16 GtR `grantCategory` rows into national_dev_banks
  -> national_dev_banks  317 routeless against a ceiling of 301  (+16)
     arrived since the ceiling was set: gtr_grantcategory_0 … and 8 more
     EXIT 1

the 11 IPCEI approval decisions un-withheld
  -> ipcei                 11 routeless against a ceiling of 0   (+11)
     arrived since the ceiling was set: ipcei_batteries, ipcei_cloud … and 3 more
     EXIT 1

an unsourced withholding
  -> [unsourced withholding] withheld_by_assertion
     EXIT 1
```

The first draft of the failure message printed five alphabetically-first ADEME
rows that had nothing to do with the poisoning. The ratchet now stores the known
routeless ids so a failure can **name the rows that arrived**. Diagnosis is most
of a guard's value; a guard that fires while pointing at bystanders gets
disabled.

### 7.4 Spain is NOT caught, and that is not a gap

The predecessor's file claimed this test would have caught all three incidents.
**It would have caught two.** 78 of Spain's 93 publishable rows carry an
application URL and 80 carry a deadline — a convocatoria *is* something a founder
can apply to. Spain's rows are **mis-named**, not non-funds.

Manufactured objects and mis-described objects are two different problems and
this axis is about the first. Claiming three of three would be exactly the
reasoning-from-our-own-columns that caused all of this.

### 7.5 It does not false-positive on real coverage growth — measured, unplanned

The strongest evidence available, and it was an accident. While this workstream
was measuring, **another workstream loaded 8 new Spanish BDNS convocatorias into
Postgres** (16:21 UTC). Tested against them:

```
8 of 8 carry route evidence  (application URL and a deadline; earliest 2026-08-11)
```

Real funds arriving through a working harvest pass cleanly. The ratchet
discriminates between coverage growth and manufactured rows, and that was shown
against live, concurrent, unplanned corpus growth rather than against a fixture
this workstream wrote for itself.

## 8. Cost: none, and that is the point

Nothing was re-opened. W withheld eleven rows for the wrong reason; this
workstream withholds **the same eleven** for a sourced one. The publishable set
is unchanged, so the sibling class does not move and no floor is approached.

Three seeds, `SPLIT=holdout N=300`, Postgres, repaired key:

| | seed 20260806 | seed 7 | seed 99 | floor |
|---|--:|--:|--:|--:|
| pool | 95% | 97% | 97% | 93 |
| EXACT@5 | 30% | 34% | 30% | 22 |
| REGIME@5 | 83% | 85% | 85% | 80 |

Against the recorded binding-state baseline (`96/96/97`, `29/34/30`, `84/86/85`)
every figure is within one point and far inside the printed ±2–5 intervals.
**No floor lowered, none approached.**

`check_recall_floor.ts` is green on all three seeds — but note it **pins its own
seed** (`const SEED = DEFAULT_SEED`) by design, so running it three times with
`SEED=` set gives three identical runs. The three-seed measurement is
`measure_recall.ts`. Anyone asked for "three seeds" who runs the floor check has
run one.

## 9. Two things the next agent must know

**The corpus moved under this session.** `funding_instruments` went 1,076 →
1,084 at 16:21 UTC while another workstream loaded Spanish convocatorias. The
committed snapshot was exported at 16:01 and is therefore **8 rows behind
Postgres**; `check_corpus_currency` will be red until someone republishes. That
is not this workstream's change and it was deliberately not raced — republishing
into another workstream's write is how France's night was lost.

When it is republished, re-run `npx tsx scripts/emit_offer_route_ratchet.ts`.
The 8 rows are route-evidenced (§7.5) so the ceilings should not move; if they
do, that is the check working.

**`check_leaf_cap` is RED and was red before this workstream** —
`state_aid_satr`/DE at 103 against a cap of 90. It is open item 1 in
`CONTINUE_HERE.md` with its binding-state baseline already captured, and it
stops the `&&` chain in `npm run check`, so the seven checks after it must be run
individually until it is resolved. All seven pass:
`payload_budget`, `client_boundary`, `dependencies`, `recall_leaks`,
`extracted_quotes`, `corpus_currency`, `recall_floor`. `check_hydration_parity`
reports **7 differences, which is the documented pre-existing count** — none of
the differing rows carries `route_status`.
