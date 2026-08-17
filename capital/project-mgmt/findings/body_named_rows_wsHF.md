# wsHF — twenty-two rows stopped being called "Finanzamt Aachen-Stadt", and the skip list that made them that way

**FOR THE OWNER, VERBATIM.** Twenty-two corpus rows that were shown to founders
as the name of a **German tax office, a French ministry or an Italian
directorate** now carry the scheme's own registered title from the Commission's
state-aid case register, written to Postgres on your specific authorisation for
`SA.40391`, `SA.56245` and `SA.49781` and nothing else. It was **22 rows, not
the eleven in wsHA's finding** — eleven was the count inside wsHA's working set;
the same three SA numbers carry twenty-two rows corpus-wide, and every one of
them had the identical defect and the identical remedy. **It moved the funnel by
[FUNNEL_HEADLINE].** That is the honest result and it was the expected one: the
shipped ranker scores an *embedding of `instrument_profiles.profile_text`*, that
text is built from `name`, and renaming in `funding_instruments` does not
re-embed it — so the ranker is still reading "Finanzamt Aachen-Stadt" until a
publish step nobody has authorised runs. **The row is still worth fixing because
it was wrong.** A door labelled with a tax office's name cannot be chosen over
its sibling by anything — not the model, not a founder reading the page.

The part worth your attention is not the rename. It is **why the rows were like
that**, because it was not an oversight. `populate_funding_instruments.py`
already names 430 of 453 state-aid children from this register. Four SA numbers
sat in a hand-written skip list, `CASE_TITLE_NOT_A_SCHEME`, with a **correct**
reason: the register record those numbers resolve to is an *evaluation plan*,
not an aid scheme, and calling a fund "Germany - Evaluation plan for the block
exempted R&D tax incentive scheme" would be precise about the wrong thing. What
the skip never asserted is what those rows would be called **instead** — and the
answer was the loader's fallback, the granting body. A skip list with a good
reason and no downstream assertion is how a fix becomes a defect. The register
held the answer the whole time, in a field this loader already parses: an
evaluation-plan case **links** the scheme it evaluates.

---

```
run            2026-08-17, isolated worktree wsHF-titles
store written  POSTGRES (funding_instruments.name, name_source) — the store the
               product reads, so a founder served today already sees the titles
rows written   22, under SA.40391 / SA.56245 / SA.49781
NOT written    5 more rows carrying the identical property — see §4
cost           four register POSTs (free, public API) and two funnel runs.
               NO paid model call. NO Voyage re-embedding.
verified       every title read back from the register by exact `reference`
               match on 2026-08-17, and every row read back from Postgres after
               the write
evidence       project-mgmt/evidence/wshf_scheme_titles_2026-08-17.jsonl
reproduce      python3 ETL/terms/apply_scheme_titles_wshf.py \
                   --scheme SA.40391 SA.56245 SA.49781 --dry-run
               npx tsx website/frontend/scripts/_wshf_sweep.ts     (free, offline)
               python3 ETL/lib/test_scheme_title.py                (free, offline)
```

**No `make republish`, no `push_local.py`, no `pull_db.py`, no schema change, no
column other than `name` and `name_source`.** `GUARD_NO_PUBLISH=1` on every
check. No floor was moved to make anything green — the one new check is **red
today and deliberately not wired into `npm run check`**; §4 says what has to
happen before it can be.

---

## 1. The property, stated so a row nobody here has seen is caught

> **A ROW MAY NOT BE OFFERED UNDER THE NAME OF THE BODY THAT GRANTS IT, UNLESS
> AN OFFICIAL SOURCE SAYS THAT IS THE OBJECT'S OWN NAME.**

The test for an unseen row, in a language nobody here reads, with no word list
at all. Two **independently sourced** strings already sit on every row. `name`
is what a founder is shown. `administeringBody` is a majority vote over the
granting authority published on each individual **award** — a different column,
from the register's own filings, never touched by the naming pass. Fold both
(NFKD, strip combining marks, lowercase, everything that is not a letter or a
digit *in any script* to a space) and compare. **Same string ⇒ the name carries
nothing the body column does not already carry.** The row has no identity of its
own, and no sibling of the same scheme granted by a different body can be told
apart from it on anything a founder can read.

The escape clause is the whole of the judgement and it is not a guess:
`nameSource` records **who** named the row. A row named by an official source
that happens to name it after its agency is correctly named — three Greek leaves
are exactly that, where the register's own registered title *is* the granting
authority string the filing carries. A rule without the clause calls all three a
defect; a rule that is only the clause (`nameSource === "deterministic"`) selects
372 rows, nearly all real funds. Neither half decides anything alone. The
conjunction decides all thirty.

### Why it is relational and not a register of words

Because the register of words cannot be written, and this repo already has the
best one anybody here would write. `applyableBody.ts` holds eight
department-designator morphemes, compound-aware across Germanic, Romance,
Slavic, Baltic, Finnic and Hungarian, derived from a real rendered brief. **It
is blind to most of this defect's instances**, and the test asserts that rather
than claiming it:

| string | `applyableBody` sees a department | this rule catches it |
| --- | --- | --- |
| `Ministère de l'économie et des finances` | yes | yes |
| `Finanzamt Aachen-Stadt` | **no** — a tax office | yes |
| `Zentralfinanzamt Nürnberg` | **no** | yes |
| `MFW SL` | **no** — an initialism | yes |

**Eighteen of the twenty-two rows** are named after a Finanzamt or an
initialism. No list of words reaches them without being extended per country
forever; the relation reaches all of them and needs to know no language at all.

### The test found a real hole on its first run

The suite is mostly **invented** cases — a Bulgarian agency in Cyrillic, a
Finnish compound, a Latvian tax authority, a Japanese ministry, a case linked to
two schemes — because a suite built out of the three rows that provoked the fix
would pass forever and catch nothing that arrives next year. The first version
of the rule reused `applyableBody.fold()`, which ends `[^a-z0-9 ]`. It maps a
Cyrillic name to the **empty string**, so two identical Bulgarian strings came
back "nothing to compare" through the missing-column guard and the rule returned
clean. That is precisely the "a row in a language nobody here reads goes
unnoticed" failure the rule exists to prevent, and no real corpus row would have
caught it. `foldAnyScript` uses `\p{L}`/`\p{N}`.

Where it lives:

| | |
| --- | --- |
| the rule, for the product | `website/frontend/lib/intelligence/bodyNamedRow.ts` (leaf module) |
| its test | `website/frontend/lib/intelligence/bodyNamedRow.test.ts` — 11 tests |
| the build guard | `website/frontend/scripts/check_body_named_rows.ts` |
| the rule, for the ETL | `ETL/lib/scheme_title.py` |
| its test | `ETL/lib/test_scheme_title.py` — credential-free, instant |

## 2. The sweep: 30 rows, 27 defects, 22 authorised

Run over Postgres (1,088 rows) and over the committed snapshot; **the two agree
exactly**, which is itself the cheapest confirmation that
`check_corpus_currency`'s claim holds on these columns.

```
corpus rows                                          1088
name folds equal to administeringBody                  30
  ...vouched for by an official source (3 GR rows)       3   correctly named
  ...THE DEFECT                                         27
      of which OFFERABLE through publishableInstruments  26
      of which authorised for this write (3 SA numbers)  22
      of which NOT written                                5   see §4
```

wsHA reported **eleven**. That was eleven rows *in its working set*; the three SA
numbers carry twenty-two rows in the corpus. The arithmetic is stated here rather
than quietly absorbed, because "you approved eleven and I wrote twenty-two" is
the kind of thing that has to be said out loud.

## 3. What the register actually says, and the field that was already parsed

Every title was fetched with a fresh **POST** on 2026-08-17 (a GET on the same
URL returns HTTP 500) and matched on `reference` **exactly**. The record for
each row's own SA number turned out to be an evaluation plan — which is what the
skip list says. The register also states, in `caseLinks`, **which aid measure
the plan evaluates**, and `populate_funding_instruments.py` already reads that
field to redirect a closed scheme to its successor.

| row's `scheme_code` | its own register record | links to | the scheme's registered title |
| --- | --- | --- | --- |
| `SA.40391` | `Régime cadre RDI 2014-2020 - plan d'évaluation` | `SA.58995` | `Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l'innovation (RDI) pour la période 2014-2023` |
| `SA.56245` | `Germany - Evaluation plan for the block exempted R&D tax incentive scheme "Forschungszulagengesetz"` | `SA.114724` | `Steuerliche Förderung von Forschung und Entwicklung [BMF]` |
| `SA.49781` | `Evaluation plan for large R&D aid scheme under the Fund for sustainable growth` | `SA.42139` | `Intervento del fondo per la crescita sostenibile a favore di progetti di ricerca e sviluppo realizzati nell''ambito di accordi sottoscritti dal Ministero dello sviluppo economico con le regioni e le altre amministrazioni pubbliche.` |

**`SA.40391` is why the link map is built both ways, and it is not a detail.**
Its own record carries no `caseLinks` at all; the edge exists only on
`SA.58995`'s side. A forward-only reading resolves three of the four skipped
numbers and silently leaves the fourth — and the fourth is the one with **three
offerable French rows**.

**Two things were deliberately NOT cleaned.** `[BMF]` is the Commission's own
issuer annotation and `nell''ambito` is a doubled-apostrophe artefact of their
export. Both classes already exist on rows this same register named (two shipped
rows carry the doubled apostrophe today), and laundering them here would smuggle
a second, unrelated change into a bounded one. What the official source
publishes is what got written. They are in `AWAITING_APPROVAL.md` §0d.

**The refusal is part of the rule.** `SA.59366`, the fourth skipped number,
links to **two** titled cases (`SA.47101` and `SA.112158`). The function returns
`None` with a reason rather than picking one, the row keeps its wrong name, and
the check goes red on it. Putting a name in front of a founder that the register
does not support is worse than a loud failure.

## 4. What was NOT written, and why the new check is not wired in

The property catches five rows beyond the authorisation. **None was touched.**
They are listed with their reasons in `project-mgmt/AWAITING_APPROVAL.md` §0.

| id | shown as | |
| --- | --- | --- |
| `satr_fr_rnd__sa_59366__ministere_de_la_transition_ecologique_et_solidai` | Ministère de la Transition écologique et solidaire | a **fourth** SA number; register links two candidates; already withheld from the pool |
| `bpifrance_inov` | Bpifrance | no SA number — outside the register entirely |
| `bpifrance_innovup_leader_idf` | Bpifrance | ditto, and its id says the row is *Innov'up Leader IdF* |
| `innovasjon_norge_loan_risk` | Innovasjon Norge | ditto |
| `innovasjon_norge_loan_lowrisk` | Innovasjon Norge | ditto |

The four national-development-bank rows are **offerable today**. They are a
different repair — a funder page read by a person — not a register lookup.

**`check_body_named_rows.ts` is therefore red, and is NOT in `npm run check`.**
Two independent reasons, both of which are somebody else's decision:

1. It reads the **committed snapshot**, hermetically, like `check_name_evidence.ts`.
   The snapshot still carries the twenty-two old names. **Postgres is the store
   the product reads, so founders already see the new titles**; the snapshot is
   what CI reads and it needs `python3 website/build/eligibility_export.py`.
2. Even after that, four NDB rows fail it.

Wiring a red check in, or softening it until it goes green, are both worse than
leaving it out and saying so. Neither the snapshot regeneration nor the NDB
repair is mine to authorise.

## 5. What it moved

[FUNNEL_SECTION]

## 6. What this cannot see

- **The embedding.** `instrument_profiles.profile_text` is built from `name` and
  is what the shipped ranker scores. This write does not re-embed it, so the
  ranker still reads the old string for all 22 rows. That is the single largest
  reason to expect no movement, and it is a publish step, not a fix.
- **The model.** Both funnel runs are model-free; the six shown rows are the
  deterministic order. Whether a writer picking between two doors reads the name
  differently is not measurable without a paid memo per founder.
- **`distinguishRowNames`.** After the rename, all eighteen `SA.56245` rows share
  one title, and the shipped disambiguator appends `· via <body>` where the body
  is nameable — which it is for a Finanzamt. So a founder sees
  *"Steuerliche Förderung von Forschung und Entwicklung [BMF] · via Finanzamt
  Aachen-Stadt"*, which is strictly more than before. For the two French
  `SA.40391` rows the body is a ministry, which `nameableBody` refuses, so they
  render identically to each other — the pre-existing shape `doorLabel.ts`'s own
  header describes for `SA.111723`, not something introduced here.
