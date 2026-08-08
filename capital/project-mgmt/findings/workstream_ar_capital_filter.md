# Workstream AR — the filter was wrong, and the answers were wronger

Branch `workstream-ar-capital-filter`, off `main` at `425119ed`. Every pool and
recall number below came out of Postgres with `requireLiveCorpus` and
`requireCredentials` asserting it, and every run prints its own corpus and
timestamp. Every statement about what a fund actually PAID comes from the award
register (`satr_staging`, `funding_instruments.capital_type_basis`) and says so.

**The question.** Workstream AO gave every replayed founder their own `ticketBand`
and `capitalSought` derived from the register, and the candidate pool fell 94% → 91%
on every seed. `EXACT@5` can never exceed `P(in pool)`, so those points are a ceiling
nothing downstream can lift. Two causes were named and could not be separated: the
capital filter is too strict (a code defect), or past awards are not what a founder
would say on an intake (a harness defect).

**The verdict, on the full holdout population.**

| | share of the loss | |
|---|---|---|
| the derived answer is wrong | **66%** | harness defect → **revert** |
| the filter is wrong | **21%** | code defect → **fixed here**, in part |
| neither — the answer key names the wrong fund | **13%** | → recorded, France only |

The derived `capitalSought` is the dominant cause and it is reverted. But "the filter
is right and the harness is lying" would have been the wrong conclusion twice over:
the filter had a real defect that this population barely touches and that is live in
the product today, and a third cause turned up that neither hypothesis anticipated.

---

## 1. Every point of the loss is one rule, and `ticketBand` costs nothing

`diagnose_capital_pool.ts` replays each pair TWICE in one process — constants, then
its own derived answers — so the difference is an effect and not a change of sample,
and attributes each lost pair from the `ExclusionLog` rather than from reading code.

| seed | pool, constants | pool, derived | lost | gained | rule that removed it |
|---|---|---|---|---|---|
| 20260806 | 234/250 (93.6%) | 224/250 (89.6%) | 14 | 4 | **SEL-CAPITAL ×14** |
| 7 | 233/250 (93.2%) | 221/250 (88.4%) | 16 | 4 | **SEL-CAPITAL ×16** |
| 99 | 234/250 (93.6%) | 226/250 (90.4%) | 11 | 3 | **SEL-CAPITAL ×11** |

Not one pair on any seed was lost to any other rule — not country, not the leaf cap,
not a failed gate. Measured on the code as it shipped, which is the right basis for
diagnosing it; the pool figures are unchanged by the fix in §6 (234 → 224 there and
234 → 224 in the decomposition below), because the 14 instruments the fix unlocks are
never the won fund on this population. The fix earns nothing on this metric and was
not made to.

The field-level decomposition (new `ANSWERS=ticket` / `ANSWERS=capital` modes) settles
which answer spends it, seed 20260806:

| answers | derived for | in pool | EXACT@5 | REGIME@5 |
|---|---|---|---|---|
| off | — | 234 | 53 | 201 |
| **ticket** | 130/250 founders | **234** | 63 | 205 |
| **capital** | 126/250 founders | **224** | 65 | 199 |
| real | both | 224 | 76 | 199 |

`ticketBand` costs **exactly zero** pool — 234 against 234, not "within noise" —
and `capitalSought` costs all of it. That is the prediction from the code and it is
now measured rather than asserted: `channelServesBand` was retired to `return true`
and deleted, so ticket size reaches only `awardScorer`/`scaleFit`, which reorder.
`capitalSought` is the only derived answer wired to a `.filter()`.

**So `ticketBand` is kept and `capitalSought` is reverted.** Ticket is kept because it
costs nothing and is not circular — a company's median award is a fact about the
company, a fund's award median is a fact about the fund, and the two are different
quantities — not because it gains: on EXACT@5 it is flat (+10 on seed 20260806 against
an anomalous `off` run, −2 on seed 7). Capital's EXACT@5 gain is not credit the ranker
earned; raising exact recall while cutting the pool is the signature of a self-grading
signal, and §3 shows where the self-grading comes from.

---

## 2. The code defect: a label that names no kind of capital was removing funds

`funding_instruments.capital_type` is ONE value chosen by a majority vote over an
instrument's own awards (`family_capital_type`,
`ETL/events/load/populate_funding_instruments.py`). Three of its values are not the
outcome of that vote; they record that it produced no answer:

| value | what it means | publishable instruments | what the filter did |
|---|---|---|---|
| `blended` | nothing reached the 60% threshold | 5 | mapped to the **equity** option and listed as **dilutive** |
| `unknown` | no determinable kind, or a synthetic rollup | 9 | answered to no option — removed for everyone |
| `framework` | an EU-law record, not a funding product | 0 (8 in corpus) | same |

### `blended`, checked one by one against the vote the ETL records beside each label

```
NO  n=2977  split vote {'loan': 1451, 'guarantee': 1526}
BE  n= 784  split vote {'grant': 445, 'tax_credit': 339}
BE  n= 282  split vote {'grant': 155, 'tax_credit': 127}
ES  n= 153  split vote {'grant': 88,  'loan': 65}
ES  n= 120  split vote {'grant': 64,  'loan': 56}
ES  n=  83  split vote {'grant': 38,  'loan': 45}
ES  n=   0  bdns instrumentos: PRÉSTAMO; SUBVENCIÓN…
ES  n=   0  bdns instrumentos: PRÉSTAMO; SUBVENCIÓN…
IT  n=   0  (no vote)
```

**Not one equity award among them.** The largest is 2,977 awards split 1,451 loan
against 1,526 guarantee — a national debt programme, 100% debt, that only a founder
ticking "Equity & blended finance" could see, and that every founder asking for the
debt it actually provides was denied.

The comment that justified this cited the EIC's blended route as carrying an equity
component. `eic_fund` is `capital_type = equity`; every `equity` instrument in the
corpus is a unanimous vote. There is no blended-with-equity instrument. The comment
described a fund that does not exist under that label.

This defect is **live in the product and independent of the harness**, which is why
"the filter is right" would have been the wrong conclusion. It barely registers on
this recall population only because those 14 instruments are rarely the won fund.

### How far the vote reaches beyond those nine

From `capital_type_basis`: **114 instruments carry a label whose own vote did not
cover all their awards**, and 22,127 of 416,423 award rows (5.3%) fall outside their
instrument's label — an **upper bound**, because the vote's denominator includes
awards whose kind the ETL could not determine. Not fixed here: the losing kinds are
discarded and nothing published to Postgres can recover them. See §6.

---

## 3. The harness defect (66%): the leak guard became an anti-signal

The derived answer reads `satr_staging.aid_instrument_text`. The corpus's
`capital_type` is derived from **the same column**, one hop away (`aid_instrument_text`
→ `map_instrument_to_bid` → `public_funding_events.aid_instrument` → `SATR_INSTRUMENT_MAP`
→ row type → vote → label). So `capitalSought` has exactly the circularity `useOfFunds`
was excluded for: the answer and the thing it is matched against come from one field.

That circularity is visible in the numbers — `ANSWERS=capital` raises EXACT@5 while
cutting the pool, which is what a self-grading signal looks like.

And the leak guard makes it worse, not better. `other_scheme` derives the answer from
every award **except the won scheme's**. That does not make the answer neutral about
the won fund; it makes it **anti-correlated** with it. Any kind of capital a company
took only from the fund it won is guaranteed absent from its derived answer — which
guarantees the filter removes exactly the fund the pair exists to find. Leak-proofing
that produces a negative leak.

Two further reasons it is not what a founder would say:

- **A tax credit is not a preference.** A company that claimed an R&D tax credit is
  derived as "wants tax credits" and thereby cut off from every grant programme in
  Europe. This is most of Germany's loss.
- **Receipts are not intent.** The intake field is forward-looking — *Grants*,
  *Loans & guarantees*, *Equity & blended finance*. 1,419 of the 1,890 derivable rows
  collapse to `["grant"]` alone where the constant was `["grant","loan"]`. The
  narrowing is the whole effect.

---

## 4. The third cause (13%): one programme, two funds, and a key that does not say which

A fund in this corpus is not a scheme. It is a scheme **as delivered by one body** —
and 21 (scheme, body) pairs are split again into a grant fund and a loan fund sitting
in **two different regimes**, covering 17,101 awards.

The answer key does not record which of the two paid. With the constant
`["grant","loan"]` both siblings were admitted and the two were never
distinguishable; with a derived `["loan"]` the grant sibling is cut and the pair
scores a miss — even though the loan sibling exists, carries 3,053 awards, and is
exactly what the founder is routed to. **Neither `EXACT@5` nor `REGIME@5` can absorb
it, because the siblings are in different regimes.**

On the strictest test — the key names a fund the company was demonstrably never paid
by — this is 12 of the 94 cut pairs, and **all 12 are French**.

This nearly produced a wrong finding. Keyed on the scheme alone, one sibling's awards
read as the other's and the grant fund looked like "a fund that paid this company a
loan" — a filter defect that is not there. The register lookup is now keyed on
(company, scheme, granting body).

### Worth its own workstream: France's ceiling may be partly an artefact

| country | holdout rows | won fund has a capital-type sibling, in another regime |
|---|---|---|
| **FR** | 778 | **106 (13.6%)** |
| ES, DE, SE, IT, NL, GB, EE, DK | 1,880 | **0** |

France is 31% of pairs and the worst market at 16-17% EXACT@5. 13.6% of its pairs
name one of two funds representing one real programme, with no record of which one
paid. That is a structural ceiling on French exact recall that no ranking change can
lift, it exists in no other market, and it was not known before this run.

---

## 5. Per country, on the full holdout population (94 cut pairs)

| country | cut | answer-key | code defect | harness |
|---|---|---|---|---|
| FR | 40 | **12** | 4 | 24 |
| DE | 30 | 0 | 6 | **24** |
| IT | 20 | 0 | 8 | 12 |
| NL | 2 | 0 | 0 | 2 |
| GB | 2 | 0 | 2 | 0 |

The two biggest markets fail differently and an aggregate nets them out: France's loss
is a third answer-key, Germany's is four-fifths the derived answer, and Italy carries
the largest code-defect share. This is why the run reports by country.

By regime size, the losses are concentrated in the crowded regimes (51+) — the
founders whose fund has 50 siblings, where the pool is worth the most.

---

## 6. What changed

**Shipped.** `blended`, `unknown` and `framework` no longer remove anything.

> **The property.** A founder's stated capital preference removes a fund only on
> evidence that the fund does not provide what was asked for. A label recording that
> a vote produced no answer is silence, and a filter must not read silence as
> contradiction.

Stated as a property, so a capital type nobody has seen yet is covered: an unmapped
value is silence too, rather than universally excluded — which is the failure
`unknown` and `framework` were already having, invisibly. Silence is the safe default
for a founder and the dangerous one for us, because the filter simply stops
discriminating and nothing goes red. So `check_capital_reach.ts` fails the build
unless **every** capital type in the live corpus is classified on purpose. The unit
tests were mutation-checked: restoring `blended` to `DILUTIVE`, or dropping the
indefinite test, fails two of nine.

The memo's `capital` fit component was moved to the same rule, so the filter and the
score cannot disagree.

**Reverted.** The `capitalSought` derivation. `ticketBand` stays.

---

## 7. Recommended next, not done here

1. **Repair the capital-type sibling attribution in the answer key.** 12 French
   holdout pairs, 106 exposed, and a plausible share of France's EXACT@5 gap. Same
   shape as `repair_recall_attribution.py`: the register knows which body paid which
   kind, so the key can name the right sibling.
2. **Persist the capital mix.** `populate_funding_instruments.py` already builds the
   per-award `Counter` and discards it. Serialising it beside `sector_mix` and
   testing membership instead of equality removes the 114-instrument residue. Needs a
   migration and a corpus republish, which is why it is not in this branch.
3. **Carry out `SEL-CAPITAL`'s recorded disposition.** `rules.ts` has classified it
   `kind: "opinion", disposition: "fit-score"` for months, and `fit.ts` has a
   `capital` component — but only on the memo path. On the path that builds the
   founder's table it is still a hard filter, which is why a wrong label erases a
   fund instead of demoting it. With the mix persisted this becomes a safe swap.
4. **`pipeline.ts:802` `capitalMismatch` is dead code** — defined, never called.

---

## 8. The near miss, recorded because it decided the finding once already

The first run of the diagnostic reported **14 of 14 lost pairs as harness defects** —
unanimous, plausible, and entirely an artefact. A NUL byte in the lookup key meant
every register lookup missed, the miss fell through to an empty default, and an empty
record looks exactly like "this fund does not pay that", which is evidence for one of
the two hypotheses under test. Nothing in the output looked wrong, because a clean
verdict in the direction you half-expect does not read as suspicious.

The second version made the opposite error in the opposite direction: keyed on the
scheme rather than on (scheme, body), it reported France as 5-for-5 **code** defect,
because one capital-type sibling's awards were being read as the other's.

Both readings were wrong, both were confident, and both would have shipped a
one-sided conclusion. What the file does now: a missing record is **fatal**, never
defaulted; "we cannot tell" is its own bucket and is never netted into either side;
and each bucket is tested strongest-evidence-first, so a pair is only called a code
defect after a mis-keyed answer has been ruled out.

### One caveat on the numbers, stated rather than buried

`EXACT@5` moved between two runs of the **identical** configuration (seed 20260806,
`ANSWERS=off`: 62, then 61, then 53 of 250) while `in pool` stayed at 234 in all
three. Other worktrees were running recall harnesses against the same Postgres and
Voyage endpoint throughout; `semanticFundMatch` has a 6s timeout and degrades to the
lexical index silently, which is the shape of that variance. Pool is stable and every
pool claim here is safe; single-run `EXACT@5` differences of a few points are not,
which is why §1's conclusion rests on the paired within-process comparison and on
pool rather than on a cross-run exact-recall delta.
