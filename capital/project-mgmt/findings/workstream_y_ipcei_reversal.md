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

## 5. The general lesson, as a test

Three rows-that-are-not-funds in one night, from three unrelated sources:

| incident | the row's identity came from | the object a founder can apply to |
|---|---|---|
| GB, 16 leaves | GtR `grantCategory` — an award's *classification* | an Innovate UK **competition** |
| IPCEI, 11 leaves | a Commission **approval decision** | a national **EoI call** / implementing scheme |
| ES, legal-citation rows | a **legal citation** naming the enabling instrument | a **convocatoria** |

The shared structure is not "missing metadata". It is:

> **The row's identity was taken from a register of aid already granted, using a
> field that describes the award rather than identifying the offer the recipient
> applied to.**

Each time, the first instinct was to hide the row. Each time, the correct move
was to ask what object the register's own subjects had actually applied to, and
to go and look at the body that runs it.

The check is in `website/frontend/scripts/check_offer_route.ts` and its design
is written up there. In summary:

- No publishable leaf may carry `route_status = 'none'`. (Non-funds cannot be
  proposed — the fix, not the symptom.)
- Every `route_status = 'none'` must cite a source. (You may not delete a row
  from the offer by assertion.)
- **Ratchet, per source family:** the number of publishable leaves with
  `route_status = 'unrecorded'` may not increase for any family. This is the
  part that would have caught all three incidents *on the day they landed*: a
  new extractor that manufactures sixteen rows nobody can apply to raises its
  family's unrecorded count by sixteen and fails the build immediately, instead
  of being invisible inside a corpus-wide total.

The ratchet is deliberately not "must be zero". 507 of 806 publishable rows have
no recorded route today, overwhelmingly SATR schemes that are real and whose
route we simply have not harvested. **A NULL route is a gap in our collection,
not a fact about the world**, and a check that treated it as one would delete
hundreds of real funds. What the ratchet forbids is *adding more*.
