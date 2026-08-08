# Collapsing indistinguishable siblings onto one row

**Workstream M. Closed 2026-08-08 by workstream BG. Nothing here ships, and
nothing here should be rebuilt.**

Code archived as tag `archive/wsM-sibling-collapse` (tip `4a0f80d0`, 1,099
lines: `siblingCollapse.ts`, a property test, a corpus census and a rendering
preview). The branch is deleted. `git show archive/wsM-sibling-collapse` if you
need it; you almost certainly do not, and §2 says why.

---

## 1. The measurement

Four policies, three seeds, holdout n=200, live corpus. Mean STRICT EXACT@5 —
the only figure comparable with any historical number — against a no-collapse
control of **24.7%**:

```
off 24.7      strict 20.7      sector 20.3      name 23.7
```

REGIME@5, the operational number: **87.7 / 89.0 / 88.0 / 88.0** — every
difference inside the interval.

**The seats a collapse frees buy no regime the founder did not already have.**
The two policies that merge cost exact recall in the same direction on 3 of 3
seeds. `name` merges almost nothing (10 of 797 leaves) and changes nothing.

`research/target_arithmetic.md` prices the same thing from the other end and
agrees: the collapse tops out at `0.96 x 0.93 x 0.388 = 35%` against 28% +/-6,
and only if the oracle is real.

## 2. The premise is structurally false, which is the part that closes it

The brief was "one programme behind several doors, shown once". Three corpus
facts, none known when it was approved:

1. **`administeringBody` is a required agreement in every candidate key.** A
   class spanning two bodies cannot form. The doors ARE the bodies, so the key
   forbids exactly the case the feature was for. No corpus improvement changes
   this.
2. **100% of merged classes have every member distinctly named**, under both
   `strict` and `sector`, and the name is in neither key. The largest class is
   50 ADEME calls under one row — biomass heat, packaging reuse, plastics
   recycling, cycling plans. The second is 25 Vinnova calls: AI, 6G, circular
   economy, an incubator. These are different CALLS of one agency, not one
   programme behind several doors.
3. **The affordance already ships, on the right key.** `schemeOperators`
   renders "Operated by X, Y and 4 others" for one notified scheme delivered by
   several bodies — `panelReport.tsx`, `operatorsOtherThan`. It needs no merge
   and it is visible in the French panel.

### And it is worse on the page than in the rates

`preview_collapse.ts` put one founder's five rows under all four policies side
by side. A Swedish cloud-infrastructure founder under `strict`: **46 programmes
folded out of sight across three of five rows.** Row 2, "Inkubatorprogrammet",
absorbs 24 of them — among them "Artificiell intelligens", "Digital
omställning" and "SIP - InfraSweden". The most relevant offer in the table is
deleted and an incubator programme is shown in its place. `sector` is milder and
does the same thing.

The rates said this was arguable. The rendered page does not.

## 3. Three things worth keeping that are not about collapse

- **`alsoOnThisRow` was built, carried through `buildInstitutions` into
  `InstitutionEntry`, and rendered by NO component.** The founder would not have
  got a shorter honest table; they would have got a table with rows missing and
  no notice. It went unnoticed because `rowToEntry.test.ts` only runs the
  implication one way — *rendered therefore carried* — and never *carried
  therefore rendered*. That asymmetry is general and still there. If an orphan
  audit wants one concrete case, this is it.
- **The Postgres path returns instruments with EMPTY gate arrays.**
  `hydrateDbInstruments()` loads framework gates only; leaf gates arrive via
  `hydrateGatesFor`. A census that skips it reads every leaf as gate-free and
  merges on a key missing its largest component. Workstream J hit the identical
  defect in two other harnesses (see the J merge). Any new corpus-side script
  must call `hydrateGatesFor` before it grades anything.
- **A collapse rate read country by country is three causes wearing one
  number.** FR 69% / SE 88% / GB 100% merge; DE, IT, NL, AT have siblings and
  merge 0% because their leaves genuinely differ on several facts at once
  (leave-one-out moves none of them); NO, EE, LV have no publishable siblings at
  all, so their 0% is arithmetic, not evidence. Reading one rate across those is
  reading the ETL as if it were the funding landscape. Workstream L-THIN's
  finding 6 is the same point from the coverage side.

## 4. Why the machinery was not merged switched-off

It is correct and tested, and it was tempting to keep behind `COLLAPSE=off`. It
is not kept, for the reason this file already states about `PRIOR_WEIGHT_WITH_TEXT`
in `shortlist.ts`: **a switch no production request sets is not a record of a
decision, it is a claim that the code behaves in a way it does not** — and
merging it would have shipped `alsoOnThisRow`, the orphan field the workstream
itself found, into `types.ts` and `pipeline.ts`. The decision is recorded here
and at the line in `materialiseInstrumentTable` where the call would go.
