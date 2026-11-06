# wsIG — forty-six comparators that never decided anything, and the guard that was already saying so

Free. **EUR 0.00 spent, zero model calls, zero production writes.** The write is
prepared, dry-run clean in **both** stores, and unapplied. It is in §5.

---

## 1. THE CLAIM HELD — verified from the code, not inherited

`comparator.ts` opens both numeric branches with `typeof answer === "number"`.
`EligibilityAnswers` declares exactly one number, `foundedYear`. `evaluateSpec`
is the only evaluator (`eligibility.ts` and `verdict.ts` are its only callers;
`aid_intensity` is kept out of verdicts by `isFilter`). **46** numeric specs,
every one `gate_role='filter'`, every one on a band or enum field answered with
a string. Both stores agree.

**Three corrections to the brief.**

| brief said | actually |
|---|---|
| "43 already in the corpus" | **right, and I wrongly flagged it.** 46 stored, 3 of them already in wsIE's unapplied write. 43 is mine. |
| "foundedYear, which no gate encodes on" | **true today.** But `check_gate_field_reach.ts`'s docstring still says foundedYear carries 17 specs, "nine of them an AGE, three a CALENDAR YEAR, and one reading -5". Measured 2026-08-08; the field now carries **none**. A comment that is no longer true. |
| "what is missing is a guard that fails on the ones already stored" | **it is not missing.** `check_comparator_admits.ts` has ratcheted an `INERT_CEILING` since wsGU, is wired into `ci.yml:190`, and is **red on committed main at 64 against a ceiling of 45** — printing the 46 by field and operator. Nobody had to be told; the build was saying so. |

**And 64, not 46, because inertness is not a numeric problem.** 18 more
comparators are inert for two sibling reasons a guard written about `numeric_*`
would have missed entirely:

- **8 × `exclusionFlags boolean_false`** — the field is a **list**, and
  `boolean_false` is true only for the literal `"no"`. Real GBER exclusions
  (liquidation, unrepaid rescue aid, criminal conviction) that have never once
  been applied.
- **5 × a band bound from another field's vocabulary** — four "Applicant must be
  an SME" gates hold `turnoverBand band_max "50-249"`, and one holds
  `developmentStage band_max "50-249"`. **`"50-249"` is an `fteBand` value.**
  `indexOf` returns −1 and the rule reads "not assessable" forever.

The numeric operator is not the defect. It is **one of three escape hatches an
encoder reaches for when the sentence it is reading has no field that can carry
it** — and that is what the property in §4 had to be written about.

The ratchet rose 45 → 64 because `encode_scheme_text_gates.py` seeded 19 more
gates on such fields and the encode pass duly encoded them. That pass does not
write `value_spec` itself, so wsIE's refusal in `encode_gates.py` does cover
them going forward.

---

## 2. THE SPLIT — 0 translate / 43 quarantine / 0 leave alone

A unanimous verdict is only evidence if the tests are independent and different
gates fail different ones. **Four tests, applied in order:**

| n | test | what it catches |
|---:|---|---|
| **8** | the field has no ordered scale | a threshold on `exclusionFlags`, `useOfFunds`, `ownerOver25`, `nonEuControl`, `lossesOverHalfCapital` — lists of flags and yes/no/unsure. No arithmetic to translate onto. |
| **25** | the threshold is below the scale's first edge | for `numeric_gte T` the only sound spec is `band_min(band containing T)`; when T lands in the **lowest** band it is true for everyone. Turnover of €200,000 on a scale whose first edge is **€2M**; eight employees on `1-9`; co-financing of 10% on `<25%`. |
| **9** | the bound quantity is not the field's quantity | `ihi` and `nfr_eurostars` bound what a **consortium** contributes; `satr_lv_equity` bounds a **fund's** private participants at fund level; `fr_relance` bounds a project's expenditure base where `ticketBand` holds the grant sought — wsIC's ratio; `eis_ettev_tete` reads a **€300,000** de-minimis ceiling onto a **percentage** scale. |
| **1** | the rule is already carried by a working sibling | `eit_health_catapult scheme_text_5` says "seeking funding of at least EUR 2 million" — genuinely `ticketBand`, genuinely €2M — and **`g5` already holds `band_min b500k_2m5` for the same sentence.** Translating would put two comparators on one field, the defect `check_gate_branches.py` fails the build on. |

**The one I almost translated, and the official page stopped it.**
`eis_tugiteenus_ja_arenduskes` wants turnover ≥ €25M. It passes the arithmetic
cleanly (25M sits in `10-50M`, so `band_min "10-50M"` excludes only founders who
genuinely fail), it is deontic, and it has no sibling. **I was going to write
it.** Riigi Teataja is JS-only and would not serve the act, so the measure's own
published description settled it: the €25M is the **group's consolidated**
revenue, and the measure is open to companies **operating in at least two
countries and belonging to such a group**
([ERR](https://www.err.ee/874372/tugiteenus-ja-arenduskeskuste-loomine-eestisse-muutub-holpsamaks),
[EIS](https://eis.ee/toetused/arenduskeskuste-toetus/)). Our intake asks *"What
is your annual turnover?"* about the applicant. **A small subsidiary of a large
multinational is exactly who the measure is for, and the translation would have
deleted it from them.** Priced in §3.

**The one worth keeping as the warning.** `innovation_fund_hbank`'s
`G3-financial-capacity-threshold` reads *"a financial capacity check applies to
all beneficiaries except … where the requested grant amount is not more than EUR
60,000"*. That is an **exemption from a due-diligence step**, not a ceiling on
what may be requested. Encoded `numeric_lte 60000` and translated faithfully it
becomes `ticketBand band_max "b25k_100k"` — **deleting a fund whose tickets run
to tens of millions from every founder who asks it for more than €100k.** The
brief's "confidently wrong" in one row.

---

## 3. THE REACH — and the first version of this measurement was worthless

`scripts/_wsig_inert_counterfactual.ts`, on the committed wsHW tape of all 897
held-out described founders and the committed snapshot, through
`assessInstrument`.

**The first run reported zero movement on 30,498 pairs and I nearly shipped it.
It proved nothing.** The harness wsIC and wsIE inherited from
`check_winner_not_gated` answers four fields — country, `borrowerModel`,
`sector`, `ticketBand` — and leaves the rest undefined, and `evaluateSpec`
returns null for an unanswered field for exactly the same reason it returns null
for a numeric operator on a string. **That harness would have printed the same
zero if all 46 comparators worked perfectly.**

So the sweep **answers every field the 43 comparators are keyed to**, across its
whole vocabulary — `balanceBand`, `cofinancingBand`, `exclusionFlags`,
`fteBand`, `lossesOverHalfCapital`, `nonEuControl`, `ownerOver25`, `ticketBand`,
`turnoverBand`, `useOfFunds` — each founder meeting each instrument once per
assignment in the cartesian product of that instrument's own inert fields.

```
ARM 1 — QUARANTINE THE 43.  897 founders x 34 instruments x every band answer
                            = 174,915 assessments

  band            before     after
  blocked          56388     56388
  one_blocker      79034     79034
  open             20656     20656
  unknown          18837     18837

  pairs whose BAND changes            : 0
  pairs whose FULL assessment changes : 0     <- status + filters checked
                                                 + filters passed + blocking fields
  founders who WON a corrected instrument : 36
  of those, whose won row changes at all  : 0
```

**The transition matrix is empty, and it is empty by construction.**
`assessInstrument`'s `if (result === null) continue` runs *before* `checked`,
`passed` and `blockers` are touched, so quarantining a comparator that returns
null everywhere is byte-identical to leaving it. **No founder loses a fund. No
founder gains one. 43 rows are a false claim being withdrawn, not a rule being
changed.** `blocked` counting by FIELD is not a trap here — the comparison is
the whole assessment, not the band.

```
ARM 2 — THE REFUSED TRANSLATION on eis_tugiteenus_ja_arenduskes
        turnoverBand numeric_gte 25000000  ->  band_min "10-50M"

  1786  one_blocker -> blocked
     8  open        -> blocked
  <2M     897 of 897 founders newly obstructed
  2-10M   897 of 897 founders newly obstructed
  10-50M    0        >50M   0
  founders who WON this instrument            : 0
  of those, who would LOSE their own won fund : 0
```

It costs **no founder their own won fund** — nobody in the tape won it — so it
passes the brief's harm test **on the letter and fails it on the substance**.
That is precisely why the official page had to decide it and not the arithmetic.

---

## 4. THE PROPERTY AND ITS GUARD

> **A stored comparator's OPERATOR must be able to act on the ANSWER SHAPE its
> FIELD admits.** Where they disagree the comparator can never return true or
> false, for any founder, and it must not be stored.

`ETL/terms/check_comparator_storable.py`, wired into `make eligibility` beside
`check_gate_currency.py`, **reading both stores**, and it **fails**.

Both halves are derived, never restated: the field's answer shape from
`data/vocabularies.json` (the generated projection `encode_gates.py` already
reads), the operator's required shape from one table that is the single place
this repo states what each branch of `evaluateSpec` tests. **The test for a case
nobody has seen:** take the field's declared answers and ask whether any of them
is a value the operator's branch could return true or false on. A field, an
operator or a band scale added tomorrow is judged by the same question with no
edit. **It names no gate, no fund, no country and no field**, and an operator
added to `comparator.ts` without being classified here fails loudly rather than
passing silently.

**It is not a replacement for `check_comparator_admits.ts`** — that one *runs*
`evaluateSpec` and `sanitizeEligibility`, so it cannot drift from the product,
and it should be kept. It adds the two things that check deliberately does not
do: it reads **Postgres**, the store the product serves from and the one an
encoding pass has just written to (the TS check reads the committed snapshot on
purpose, so it is blind until the next export); and it **fails** rather than
ratcheting, because the ratchet's stated justification — "two guards red for one
cause", frozen band orders cleared by `reband_ticket_gates.py` — **has expired.
None of the 64 found today is caused by a frozen order.**

**Two independent methods agree exactly at 64**: the TS check by running the
comparator, the Python check by deriving from the vocabulary and knowing nothing
about `evaluateSpec`.

**Ratchet, and the residual is named, not a remainder.** `INERT_CEILING` lowered
45 → **21**; `CEILING` in the Python guard is **21**. Simulated against live
Postgres: **64 today → 21 after wsIG's 43 → 18 after wsIE's three.** Both targets
are deliberately red until the writes land. The residual 18 needs a **corpus**
decision, not a code change, and is enumerated with its evidence in the ratchet
note — 8 `exclusionFlags boolean_false` whose real fix is a wider intake
vocabulary (there is no value for "convicted of an economic offence"), 4 + 1
mis-keyed `"50-249"` SME gates whose repair is a **new exclusion** and must be
measured first exactly as this one was, 3 `cofinancingBand boolean_true`, 1 stale
`ticketBand band_min "b250k_2m5"`, 1 `conditionality boolean_true`.

---

## 5. THE WRITE — prepared, not applied

```
python3 ETL/terms/apply_gate_encoding_corrections.py --apply --postgres \
    --corrections project-mgmt/evidence/wsig_inert_comparator_corrections_2026-08-19.jsonl
```

| | |
|---|---|
| **rows** | **43**, in **each** of 2 stores |
| **columns** | `value_spec` → `NULL`, `encoding_method` → `'quarantined'`. Nothing else. `requirement`, `quote`, `value`, `intake_field`, `verification_level`, `gate_role` untouched — they are the funder's own words and they are right. |
| **instruments** | 34 |
| **founders reached** | **0 of 897.** Proved on 174,915 assessments with every band field answered and swept. No verdict, no filter count, no blocking field changes for anyone. |
| **preconditions** | verified **read-only in both stores**: sqlite 43/43, postgres 43/43, **0 drifted, 0 already applied**. The applier refuses on any drift. |
| **reversal** | every row's prior comparator is in the corrections file as `current_value_spec`; restore `value_spec` to it and `encoding_method` to `'llm_encode'`. **Detectable**: `encoding_method='quarantined' AND value_spec IS NULL` on those 43 `(instrument_id, gate_key)` pairs. |
| **blast radius beyond the table** | none. No page, no export and no memo reads these 43 — that is what inert means, and §3 is the proof. `make eligibility` and `ci.yml` go **green** on both new/tightened ceilings the moment it lands. |
| **collision** | **zero writes made to `eligibility_gates` by this workstream**, as wsIE also did, because wsHX may be promoting gates by union. Everything here is `ETL/terms/` code, `website/frontend/scripts/`, one ceiling constant, and my own corrections file. The 3 overlapping numeric rows are left to **wsIE's** write and excluded from mine by id. |

**`make eligibility` is red until this lands, deliberately** — as it already was
for wsIC's and wsIE's. No threshold was moved to make anything green; both
ceilings were **tightened**.
