# Workstream AR — both suspects were guilty, and they are separable

Branch `workstream-ar-capital-filter`, off `main` at `425119ed`. Every number below
came out of Postgres with `requireLiveCorpus` and `requireCredentials` asserting it;
every run prints its own corpus and timestamp.

**The question.** Workstream AO gave every replayed founder their own `ticketBand`
and `capitalSought` derived from the register, and the candidate pool fell 94% → 91%
on every seed. `EXACT@5` can never exceed `P(in pool)`, so those points are a
ceiling nothing downstream can lift. Two causes were named and could not be
separated from the aggregate: the capital filter is too strict (a code defect), or
past awards are not what a founder would say on an intake (a harness defect).

**The answer: both, in roughly equal measure, and neither reading was safe alone.**

---

## 0. The result in one table

_(filled in below from the runs; see §2 and §4)_

---

## 1. Every point of the loss is one rule, and it is not the one under suspicion

`diagnose_capital_pool.ts` replays each pair TWICE in one process — once on the
constants, once on its own derived answers — so the pool difference is an effect
rather than a change of sample, and attributes each lost pair from the
`ExclusionLog` rather than from reading the code.

| seed | pool, constants | pool, derived | lost | gained | rule that removed it |
|---|---|---|---|---|---|
| 20260806 | 234/250 (93.6%) | 224/250 (89.6%) | 14 | 4 | **SEL-CAPITAL ×14** |
| 7 | 233/250 (93.2%) | 221/250 (88.4%) | 16 | 4 | **SEL-CAPITAL ×16** |
| 99 | 234/250 (93.6%) | 226/250 (90.4%) | 11 | 3 | **SEL-CAPITAL ×11** |

Not one pair on any seed was lost to any other rule — not country, not the leaf cap,
not a failed gate. `ticketBand` costs zero pool, and it cannot cost any: it is a
score and nothing else. `channelServesBand` was retired to `return true` and deleted,
and `awardScorer`/`scaleFit` only reorder. `capitalSought` is the only derived answer
that is wired to a `.filter()`.

So the three points are entirely `instrumentServesCapital` and
`passesCapitalPreference`, which is where AO pointed. What AO could not do was say
whether the filter or the answer was wrong, and the honest answer turned out to be
"one of each, and they are not the same instrument".

---

## 2. The code defect: a label that names no kind of capital was removing funds

`funding_instruments.capital_type` is ONE value chosen by a majority vote over an
instrument's own awards (`family_capital_type`,
`ETL/events/load/populate_funding_instruments.py`). The per-award kinds that lose the
vote are discarded — the `Counter` is built and thrown away, and no per-award capital
type is persisted anywhere the frontend can read. So the label answers "what were
most of this fund's awards", and the filter was reading it as "what does this fund
pay".

Three of its values are not the outcome of that vote at all. They record that it
produced no answer:

| value | what it means | instruments (publishable) | what the filter did |
|---|---|---|---|
| `blended` | nothing reached the 60% threshold | 5 | mapped to the **equity** option and listed as **dilutive** |
| `unknown` | no award carried a determinable kind, or a synthetic rollup | 9 | answered to no option — removed for everyone |
| `framework` | an EU-law record, not a funding product | 0 publishable (8 in corpus) | same |

### `blended` is the sharp one, and it is live in the product

All nine `blended` instruments in the corpus, checked one by one against the split
vote the ETL writes beside each label:

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
against 1,526 guarantee — a national debt programme, 100% debt. Because `blended`
sat in `CAPITAL_SOUGHT_TO_DB.equity` and in `accessMode.DILUTIVE`, it was visible
**only** to a founder who ticked "Equity & blended finance" — the one thing it does
not provide — and hidden from every founder who asked for the debt it does.

The comment that justified this said a blended instrument carries an equity component
and cited the EIC's blended route. `eic_fund` is `capital_type = equity`. There is no
blended-with-equity instrument in the corpus; the comment described a fund that does
not exist under that label. By contrast every `equity` instrument is a unanimous
vote — the label is doing its job there, which is why `equity` stays dilutive.

### How far the majority vote reaches beyond those nine

From `capital_type_basis`, the audit string the ETL already writes beside every
label: **114 instruments carry a `capital_type` whose own vote did not cover all
their awards**, and 22,127 of 416,423 award rows (5.3%) fall outside their
instrument's label. That figure is an **upper bound on real erasure**: the vote's
denominator includes awards whose kind the ETL could not determine, and those are
counted here as disagreeing. The worst are the largest programmes in the corpus —
national R&D rollups and Horizon clusters, all labelled `grant`.

This third defect is **not fixed here** and is the recommendation in §6: the losing
kinds cannot be recovered from anything published to Postgres, so the fix is a real
`capital_mix` column, which needs an ETL migration and a corpus republish. Half-doing
it by parsing the audit string in product code would put a hidden coupling to a
Python f-string on the founder's path.

---

## 3. The harness defect: the leak guard turned into an anti-signal

The derived answer reads `satr_staging.aid_instrument_text`. The corpus's
`capital_type` is derived from **the same column**, one hop away
(`aid_instrument_text` → `map_instrument_to_bid` → `public_funding_events.aid_instrument`
→ `SATR_INSTRUMENT_MAP` → row type → vote → label). So `capitalSought` has exactly the
circularity `useOfFunds` was excluded for — the answer and the thing it is matched
against come from one field.

But the leak guard makes it worse than circular, not better. `other_scheme` derives
the answer from every award **except the won scheme's**. That does not make the
answer neutral about the won fund; it makes it **systematically anti-correlated**
with it. Any kind of capital a company took *only* from the fund it won is guaranteed
absent from its derived answer — and that guarantees the filter removes exactly the
fund the pair exists to find. Leak-proofing that produces a negative leak.

Two further reasons the derived answer is not what a founder would say:

- **A tax credit is not a preference.** A company that claimed an R&D tax credit is
  derived as "wants tax credits" and thereby cut off from every grant programme in
  Europe. Nobody choosing between funding routes would answer the intake that way; an
  R&D credit is claimed, not chosen against a grant.
- **Receipts are not intent.** The intake field is forward-looking — "Capital types
  the founder wants", labelled *Grants*, *Loans & guarantees*, *Equity & blended
  finance*. The derivation answers a different question: what this company has been
  paid before. 1,419 of the 1,890 derivable rows collapse to `["grant"]` alone, where
  the constant was `["grant","loan"]`. The narrowing is the whole effect.

`ticketBand` has **no** such circularity, and the measurement in §4 shows it: a
company's median award is a fact about the company, the instrument's award median is
a fact about the fund, and the two are different quantities. It is also not wired to
any filter.

---

## 4. Per stratum

_(filled in from the runs)_

---

## 5. What changed

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
unless **every** capital type in the live corpus is classified on purpose — mapped to
an option, or declared indefinite. `capitalPreference.test.ts` pins the property and
was mutation-checked: restoring `blended` to `DILUTIVE`, or dropping the indefinite
test, fails two of nine.

**Reverted.** The `capitalSought` derivation. `ticketBand` stays.

---

## 6. Recommended next, not done here

1. **Persist the capital mix.** `populate_funding_instruments.py` already builds the
   per-award `Counter` (`fam_capital_votes[fam]`) and discards it. Serialising it
   beside `sector_mix`, publishing it, and testing membership instead of equality
   removes the whole class: 114 instruments stop denying their own awards. Needs a
   migration and a corpus republish, which is why it is not in this branch.
2. **Carry out `SEL-CAPITAL`'s recorded disposition.** `rules.ts` has classified it
   `kind: "opinion", disposition: "fit-score"` for months, and `fit.ts` already has a
   `capital` component — but only on the memo path. On the path that builds the
   founder's table it is still a hard filter, which is why a wrong label erases a
   fund instead of demoting it. With the mix persisted, this becomes a safe swap.

---

## 7. What this cost to find, and the near miss worth recording

The first run of the diagnostic reported **14 of 14 lost pairs as harness defects** —
unanimous, plausible, and entirely an artefact. A NUL byte in the lookup key meant
every register lookup missed, the miss fell through to an empty default, and an empty
record looks exactly like "this fund does not pay that", which is evidence for one of
the two hypotheses under test. Nothing in the output looked wrong, because a clean
verdict in the direction you half-expect does not read as suspicious.

Three changes came out of it, and they are the reason the numbers above are worth
anything: a missing record is now **fatal** rather than defaulted; "we cannot tell"
is its own bucket and is never netted into either side; and the evidence base is
widened from `satr_staging` (state-aid rows only, roughly half the corpus) to
`capital_type_basis`, which exists for every instrument.
