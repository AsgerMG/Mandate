# wsID — the separating fact was in the name, and the renderer cut it off

**FOR THE OWNER.** Three corrections to the brief, all of them cheap and all of
them changing what the workstream was.

## ██ 1. SA.40391 IS NOT ON THE PAGE. NO FOUNDER SEES IT.

All three leaves are **withheld as closed** — `publishabilityFailures` returns
*"the register says the window has shut"* for every one, because the
Commission's own record gives `caseMeasureEndDate 2020-12-30`.

```
SA.40391: 3 leaves, offerable 0
```

`dead_doors_wsHQ` withheld them on **2026-08-18**, the day after `wsHF` found
them byte-identical, and said so in its own report — *"the won fund, SA.40391 —
itself a scheme that ended 2020-12-30 — is now ABSENT from the candidate pool"*.
The two findings were never joined, so the item survived into
`AWAITING_APPROVAL.md` §3 and `RESUME_HERE.md` §3 as a live defect. **It is not
one.** Both should be struck.

**And the ground truth is one level up from where the brief put it.** SA.40391
is the *evaluation plan*; the scheme it evaluates is **SA.58995**, and that is
the record with a title, a period and nine GBER objectives. wsHF's rename was
right about which case to read. What follows is about SA.58995 and SA.111723 —
the same three-doors-of-one-regime shape, on leaves that **are** offerable.

## ██ 2. WHAT SEPARATES THE DOORS, FROM THE OFFICIAL RECORD

The register publishes ONE title for SA.58995 and does **not** name doors. What
it does publish is `caseAidInstruments`:

```
SA.58995  Guar (guarantee) · Lradv (loan / repayable advance)
          Taote (tax advantage) · Dgirs (direct grant / interest-rate subsidy)
```

**So the officially-grounded separator is THE FORM OF THE AID.** Our
`capital_type` is that fact per leaf, and it is a unanimous per-award vote
(307/307, 498/498, 81/81 on the SA.40391 leaves; the same shape on SA.58995).
A founder choosing between these rows is choosing between a **grant** and a
**repayable advance**, which is the single largest thing about a fund.

Everything else we hold is **award history, and therefore evidence and never a
verdict**: the SA.40391 agriculture leaf is 94% agrifood by recipient sector and
pays a €454k median against the economy leaf's €899k over 498 awards. The
register does not say there is an agri-food door. It says the ministry granted
those awards. `IPCEI` was wrongly unpublished on exactly this confusion, so it
is stated rather than promoted.

**And the granting body is refused on purpose and rightly.** `nameableBody` will
not print a ministry as a door: a department notifies a regime, it does not take
applications. That refusal is why five French leaves of SA.111723 and SA.111726
render under one name **at full length**, where no cut can help them. They are
in §5.

## ██ 3. WHERE THE FACT DIES: TWO KEYS, ONE PAIR

The distinguisher does reach the label. `distinguishRowNames`' capital axis
appends `· Grants` / `· Loans`, and `doorLabel` appends `· via <body>`. Then:

> `distinguishRowNames` groups rows by their **RAW** label.
> `resolveNameCollisions` keys on **`rowRenderedLabel`** — the same string cut to
> `ROW_TITLE_CHARS = 120`.

Those are two different questions about one pair, and `nameCollision.ts`'s own
contract forbids it in as many words: *"the SAME function any disambiguator that
ran before this used to group by, never a second one"*. The violation is at its
only call site.

A pair whose titles differ only past character 120 is therefore **invisible to
the disambiguator** — two distinct names went in, nothing to resolve — and
**identical to the collapse**, which demotes one of them to the back of the
table and out of the pool the writer reads.

**A real second door was being spent to pay for a render budget.**

Ruled out, with evidence, in the order the brief listed them:

| candidate | verdict |
| --- | --- |
| not selected in the phase-one payload | **no** — `name` is in `BUILT_COLUMNS` and on the row |
| selected but not rendered | **no** — it is on the row and in the label |
| **rendered but truncated** | **YES**, and by `oneLine`, not `fundsSentence` |
| suppressed by `beyondTitle` | **no** — `beyondTitle` reads the description, not the title |
| empty in our corpus | **no** — `capital_type` and `administering_body` are populated on every one |

## ██ 4. THE PROPERTY, AND ITS TEST FOR A PAIR NOBODY HAS SEEN

> **A CUT MAY NOT MERGE TWO NAMES THAT DIFFER.**
> And the other half, which matters as much: **two names that are EQUAL must
> still come out equal**, or the fix hides the corpus defect the collapse exists
> to report.

The test is to run the function. Any two strings in, compare the outputs. There
is no register of known collisions and there cannot be one — the next colliding
pair is whatever a register publishes next.

`lib/intelligence/rowTitleCut.ts` spends the same 120 characters on the part
that **differs**: the head of the title, one elision glyph, then the text from
the first point of divergence, with the tail given exactly as much budget as it
needs to separate and no more. A row with no colliding peer comes back
**byte-identical to `oneLine`**, asserted four ways, so this can only ever change
a string that was already wrong.

**Raising `ROW_TITLE_CHARS` was the obvious alternative and it is not a fix.**
Those Catalan titles diverge at 152 and 217, the next register publishes one
that diverges at 400, and the cost falls on every row in the corpus. The budget
is not the variable. Where it is spent is.

**The suite is invented on purpose** — a divergence one character either side of
the cut, one 400 characters in, a group diverging at two depths, Greek, two
genuinely equal names, and ten nested depths to prove the bounded pass count
**reports** what it could not resolve instead of shipping a merge silently.

### The boundary the real corpus found and no invented case had

`oneLine` spends three characters on `...`, so it shows only the first **117**.
A pair diverging at 117, 118 or 119 collides under the plain cut while sitting
**inside** the budget — and my first guard skipped exactly those, comparing the
divergence against the head this function would print rather than against the
head `oneLine` actually shows. It accounted for **every** unresolved group on
**25 of 60** recall founders. The test now walks all three offsets.

## ██ 5. THE REACH, FREE, ON 300 FOUNDERS — AND IT IS SMALL WHERE IT IS SMALL

The counterfactual is **exact rather than a second arm**: the old key is a pure
function of a row the run already holds, so every row it would have demoted is
computable beside the row the new key keeps, same founder, same draw, same
corpus.

```
founders whose table held >=1 DISTINCT fund the old cut merged   47.3%  (142/300)
   rows                                                          1693
founders gaining >=1 of them back in the 40-row menu             36.0%  (108/300)
   seats                                                          274
   ...and the recovered row is the fund they WON                   0.7%  (2/300)
founders gaining >=1 of them in the published six                 2.7%  (8/300)
   seats                                                             9
   ...and the recovered row is the fund they WON                   0.0%  (0/300)
founders with a pair sharing a FULL name (not ours)              50.0%  (150/300)
founders where no cut could separate a distinct pair              0.0%
```

**It moves the six for eight founders in three hundred and it wins nobody their
fund on this sample.** What it changes is the MENU: a third of founders were
choosing from forty rows with real doors missing. The doors it puts back are
exactly `door_separation_wsHA`'s subject —

```
régime cadre exempté ... au développement…14-2023 · grants
régime cadre exempté ... au développement…14-2023 · loans
régime cadre exempté ... au développement…14-2023 · via conseil régional n
```

— three leaves of one French regime that were one string.

Corpus-wide, before: **113 of 760** offerable leaves shared a rendered title
with a leaf a founder in the same country could see beside it, and on **64** of
them the full names differ. The largest instances are not French: four Catalan
ICF loan lines notified under **four different aid regulations** (651/2014,
1408/2013, 717/2014, 2023/2831 — four different sets of who may borrow), and a
Basque programme's *"Área 1: Desarrollo de proyectos empresariales innovadores"*
against *"Área 2: Nuevas empresas innovadoras"*.

### The half that is not mine, and is bigger

**50% of founders are shown a pair of rows the corpus calls the same thing.**
26 offerable rows in ten classes: six Innovasjon Norge leaves all literally
`Innovasjon Norge · Grants`, three Bpifrance rows all `Bpifrance`, two
`CDTI (Spain)`, and five French leaves whose body is a MINISTRY. No cut can
touch these. It is a **corpus repair** — give the row its own name — and it is
`check_body_named_rows`'s subject and wsHF's open §4. It is ratcheted at 26 so a
load that adds an eleventh class has to say so.

## ██ 6. WHAT SHIPPED, AND WHICH SIDE OF THE ANSWER-KEY LINE EACH FILE IS ON

| file | side |
| --- | --- |
| `lib/intelligence/rowTitleCut.ts` (+ test) | **product**. Takes STRINGS, never names `InstrumentRow`, so it is outside `check_answer_not_reachable`'s scope by construction rather than by assertion |
| `lib/intelligence/shortlist.ts` — `rowRenderedLabel` → `rowRenderedLabels` | **product**. One label for the whole table; the disambiguator and the collapse now ask one question |
| `lib/intelligence/agentSelect.ts` — `buildPrompt` ~1666, `renderRow` ~1219 | **product**. Clear of wsIB (300-380) and wsIC (~1873); one added argument and one call |
| `lib/intelligence/rankerAsks.ts` — `askCandidates` | **product** |
| `scripts/check_row_titles_distinct.ts` | **product-side guard**, hermetic on the committed snapshot, in `npm run check`, tier `founder` |
| `scripts/_wsid_collide.ts` | **measurement**. Corpus only, reads no answer key |
| `scripts/_wsid_reach.ts` | **measurement**. Reads the recall answer key, as `_wsfe_seats.ts` does |

`check_answer_not_reachable` green. No new column reaches a row: the cut reads
the name it was already given.

**NO PAID MODEL CALL. NO PRODUCTION WRITE. NO CORPUS CHANGE.** `NO_PG` never
set; both measurements attest `corpus postgres`. The guard runs with
`GUARD_NO_PUBLISH=1`. No floor, tolerance or ceiling was moved — the one new
number, `SAME_NAME_ROWS.max = 26`, is a ceiling created at today's measurement
and it can only come down.

## ██ 7. WHAT THIS CANNOT SEE

- **The model.** Both measurements are model-free. Whether a selector reads
  `· grants` against `· loans` differently is not measurable without a paid run,
  and wsIA's finding says the menu's prose matters more than its order.
- **The published six barely moved and that is the honest headline.** 2.7% of
  founders gain a seat there. The pool effect is 13× larger and it is the one to
  quote.
- **`beyondTitle` still asks its question of the plain 120-character cut.**
  Deliberately unthreaded: the elided form drops SHARED text, so the words it
  loses are the ones a sibling's description would also repeat, and suppressing
  fewer descriptions is the direction `wsDW` already argued for. Stated rather
  than fixed on speculation.
- **wsHF's `check_body_named_rows` is still red**, exactly as wsHF left it and
  for its own reasons. Not touched.
