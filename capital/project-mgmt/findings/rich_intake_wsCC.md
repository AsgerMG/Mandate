# With everything a founder could truthfully say, the ceiling is 66%, not 95%

**Workstream CC · 2026-08-09 · isolated worktree off `wsCB-encoding-lift` at `10a07f96`.**

Reproduce. Steps 1–3 are FREE (Postgres, disk, and the corpus's own already-paid
voyage-3.5 gate embeddings — no model calls):

```
cd website/frontend
npx tsx scripts/dump_publishable_ids.ts /tmp/pub.json
export PUBLISHABLE=/tmp/pub.json
npx tsx scripts/_wscc_demand.ts        # the demand taxonomy — what funds ask about
npx tsx scripts/_wscc_ceiling.ts       # the split and the ceiling (structural proxy)
LABELS=/tmp/wscc_cluster_labels.json npx tsx scripts/_wscc_ceiling.ts      # with model labels
LABELS=/tmp/wscc_cluster_labels.json npx tsx scripts/_wscc_exact_bound.ts  # in EXACT@5 terms
```

Step 2's labels cost **$0.26** to produce and are cached; re-deriving them:

```
CLASSIFY_CACHE=/tmp/wscc_labels.json npx tsx scripts/_wscc_classify.ts
```

Population and key are wsCA's throughout, so every number composes with
40.0 / 43.1 / 62.0 / 85.5: publishable leaves in multi-leaf regimes,
**36 regimes holding 605 leaves**, CEILING@5 = the share of leaves whose
residual class fits the five rows shown.

---

## 1. The answer

**Under full founder information — a founder or their VC telling us everything
about the company, the technology, the plan and the money — the ceiling is
65.0% of contested leaves, which is an EXACT@5 ceiling of 65.9%.**

**95% is not reachable.** It is not reachable by a better ranker, a better
corpus, a longer intake or a smarter judge, because it is above the ceiling that
a *perfect* chooser attains when handed every fact a founder could state. The
honest maximum is **66% EXACT@5**, and two things bind it, in this order:

| binds | costs | why it cannot be prompted away |
|---|--:|---|
| pool reach — the won fund never enters the pool | **7 points** | a fund the product never shows cannot be ranked into the five |
| sibling indistinguishability under full information | **29 points** | 29% of winning funds still sit in a class larger than five after every founder-determinable demand is known, because their siblings demand the same things |

The fuzzy half of the requirement population — the thirty points wsCA surfaced
and did not pursue — **is worth 5.0 points of ceiling, not thirty.** §4.

---

## 2. The rich profile, derived from the demand side

`_wscc_demand.ts` takes every **filter** gate on a publishable instrument
(3,595 gates on 870 instruments) and groups them by *what they demand* rather
than by which of today's 25 intake fields happens to carry them. Grouping is a
cosine-threshold canopy over the corpus's own `eligibility_embeddings`
(voyage-3.5, `source_type='gate'`, already computed — 73.8% of filter gates
carry one; the rest fall back to normalised-text identity, which can never
*merge* two demands it cannot compare).

**731 demand classes at τ=0.72. Four of them cover half of all filter gates;
51 cover 80%.** The demand is extremely concentrated at the head and extremely
long in the tail — which is the shape that decides §6.

Read out, the demand splits into six things a founder can actually supply, and
this is the intake we would build:

| section | what the funds demand | reach |
|---|---|--:|
| **COMPANY** | legal form and organisation type, size, turnover, balance sheet, age, ownership, independence, registration and operating territory | the largest single cluster: **619 gates on 384 instruments** |
| **STANDING** | insolvency, undertaking-in-difficulty, recovery orders, sanctions, prior participation in a named earlier programme | 560 gates on 486 |
| **ACTIVITY** | excluded sectors and activities; the sector the project sits in | 553 gates on 504 |
| **PROJECT** | what the work is, where it happens, whether it has started, what it would produce | 142 + 103 + 72 |
| **TECHNOLOGY** | what it does, how far along, what is new about it relative to the state of the art | 43 + 35 |
| **MONEY** | project cost, requested amount, own-resources share, co-financing | 33 + 29 + 17 |

**The single largest unasked demand is organisation type, and it is not fuzzy.**
The dominant `intake_field = none` bucket is *"applicant must be an SME or a
self-employed individual"*, *"a Swedish limited company"*, *"a commune,
intercommunality or department"*, *"a university or research institute"*,
*"a public or private legal entity"*. wsCA read this bucket as SME status and
mapped it onto `fteBand`; the samples say the discriminator is not size but
**what kind of body you are**, and the intake has no field for it at all.

---

## 3. The split: which tool can decide it

Stated as a property with a test, never as a register. `_wscc_classify.ts` puts
the property in the prompt and gives **no examples from the corpus** — no fund,
country, sector or threshold value appears in it, because a classifier taught by
enumeration scores the cases it was shown and fails the rest.

- **C1 — decidable from a printable attribute.** Truth is a function of an
  attribute every applicant has and that could be a fixed answer set or one
  number on a standard scale. *TEST: two applicants agreeing on every such
  attribute always get the same verdict, AND the question could be printed
  unchanged on a form serving every programme in existence.* **A comparator is
  right here; a model is overkill.**
- **C2 — decidable, but in the programme's own units.** Truth follows from one
  number or one yes/no the applicant holds, specific to this programme's subject
  matter. *TEST: the verdict follows deterministically, but no single form could
  enumerate the possible questions across all programmes.* **A comparator is
  right in principle and cannot be built; a model reading prose decides it.**
- **F — requires judgement about what the project is.** *TEST: two applicants
  identical on every printable attribute AND every programme-specific number can
  still get different correct verdicts.* **A comparator will always be wrong.**
- **U — not determined by the applicant.** Discretion, competitive ranking,
  budget availability, or a property of the programme rather than a condition on
  the applicant. *TEST: no true statement the applicant could make changes the
  verdict.* **Nothing decides it, and it is credited to no arm.**

2,150 distinct requirement sentences, `claude-haiku-4-5`, **$0.26**. The split
and the clustering agree independently: **704 of 731 demand clusters (96%) come
back carrying a single class.**

| class | gates | clusters | instruments | already encoded |
|---|--:|--:|--:|--:|
| **C1** crisp, printable | 2,232 | 355 | 838 | 1,293 (58%) |
| **C2** crisp, bespoke units | 414 | 134 | 238 | 159 (38%) |
| **F** judgement | 358 | 206 | 242 | 154 (43%) |
| **U** not the applicant's to answer | 591 | 36 | 536 | 504 (85%) |

### The coordinator's question, answered

Of the **1,485 unencoded filter gates** on publishable instruments:

```
C1   939  63.2%   worth an encoder pass — a comparator is the right tool and we simply have not built it
C2   255  17.2%   stage 2's, with prose — no fixed answer set can exist, so no encoder pass will ever reach them
F    204  13.7%   stage 2's, with prose — a comparator would be wrong even if we wrote one
U     87   5.9%   nobody's — do not encode, do not ask
```

**459 of 1,485 (30.9%) are stage 2's to answer with prose. 939 (63.2%) are an
encoder pass.** The 43% "encoded" figure on class F is not reassuring — it is
154 gates where a comparator has been fitted to a requirement no comparator can
decide, and it should be read as a defect count, not as coverage.

**On `openFieldsForShortlist` (`lib/intelligence/gateReach.ts:66`).** The
coordinator is right that `if (!FIELD_ENUM_HINTS[field]) continue;` plus the
non-`none` field test drops every C2 and F requirement before stage 2 sees it,
and right that the text is sitting on the gate. But the gap that mechanism
explains is **459 gates on ~300 instruments, worth 5.0 points of ceiling** —
not thirty. The thirty points wsCA measured are mostly C1 text we have not
encoded (939 gates) plus wording noise (§5).

---

## 4. The ceiling under a rich profile, and why the key is not circular

The trap first, because it is the one that cost a retraction.

- **85.5% (wsBY)** keys on verbatim `eligibility_text`. Encoded gates are
  *extracted from that text*, so the key absorbs in advance anything a question
  could add. Circular. Retracted.
- **62.0% (wsCA)** keys on verbatim *requirement* text. Smaller circle, same
  shape: two funds demanding the same thing in different words are credited as
  separated, **and no founder answer can ever produce that separation**, because
  a founder answers the demand, not the sentence.

**So the key here is the set of DEMAND CLASSES a leaf makes.** Two funds that
demand the same thing in different words collapse into one class and are **not**
credited as separated. That is the exact repair: wording cannot separate, only
demand can, and a founder's answer is a function of the demand. τ is swept
rather than fitted, and τ→1 recovers the circular verbatim number, which is
printed as the check that the collapse is doing real work.

| arm | mean class | alone | **CEIL@5** | over today | regimes | top-regime share |
|---|--:|--:|--:|--:|--:|--:|
| nothing asked | 50.50 | 0.0% | 7.6% | −32.4 | — | — |
| **TODAY: the six that already rank** | 26.19 | 18.2% | **40.0%** | +0.0 | — | — |
| + every mapped field's comparator (wsCA) | 22.85 | 21.2% | 43.1% | +3.1 | 6 | 58% |
| **RICH-CRISP-ENUM** — C1 only | 17.23 | 30.9% | **53.1%** | +13.1 | 12 | 20% |
| **RICH-BESPOKE** — C2 only | 20.72 | 25.6% | **47.1%** | +7.1 | 12 | 38% |
| **RICH-FUZZY** — F only | 26.53 | 17.9% | **42.3%** | +2.3 | 10 | 18% |
| **RICH-CRISP** — C1+C2 | 14.67 | 40.0% | **60.0%** | +20.0 | 13 | 25% |
| **RICH FULL — C1+C2+F** | 14.19 | 42.0% | **65.0%** | **+25.0** | 14 | 22% |
| *[circular] verbatim requirement text* | 12.96 | 56.4% | *70.1%* | +30.1 | 14 | 25% |
| *[circular] verbatim `eligibility_text`* | 11.69 | 54.7% | *76.0%* | +36.0 | 14 | 26% |

**What a founder has to SAY to earn each figure**, which is the discipline the
brief asked for:

- **40.0%** — the six answers on today's first page.
- **53.1%** — every printable attribute of the company: legal form and
  organisation type, headcount, turnover, balance sheet, founding year,
  ownership, registered and operating territory, insolvency and sanction
  status, requested amount, co-financing share, stage of the work.
- **47.1%** — every number about the project in the scheme's own units:
  installed capacity, area, volume, distance, partner count, total project
  cost, whether work has begun, prior participation, certifications held.
- **42.3%** — prose about the technology, what is new about it, what the project
  would produce, and how it advances a programme's purpose.
- **65.0%** — all three, truthfully and completely.
- **70.1% / 76.0%** — the fund's own sentence, and then its whole eligibility
  page, word for word. **A founder cannot state either.** These are printed as
  the circular reference and must never be quoted as headroom.

**No gain here is one regime.** RICH FULL's +25.0 is 14 regimes with a
top-regime share of 22% — the opposite shape from wsCA's `fteBand`, whose +1.7
was 7 leaves in one regime. C2 alone is the most concentrated arm at 38% and is
flagged accordingly; it is not reported on its own anywhere in the recommendation.

---

## 5. The thirty points, decomposed

wsCA's `matchable 31.4%` against `present 62.0%`, resolved on one key:

```
comparators as encoded today                                       43.1%
+ encode the C1 text we already hold, and ask organisation type    53.1%   <- 939 unencoded gates
+ the bespoke numbers only prose can carry           C2            60.0%   <- 255 gates, stage 2
+ the judgement requirements only a model can decide F             65.0%   <- 204 gates, stage 2
                                                                  ------
+ credit every difference in WORDING as a separation               70.1%   <- circular, not available
+ credit the whole eligibility page                                76.0%   <- circular, not available
```

**Roughly two thirds of the thirty points is crisp text we have not encoded.
One sixth is genuinely fuzzy. The remaining sixth does not exist — it is
wording noise that the verbatim key counts and no founder can produce.**

---

## 6. The question budget, which is the finding a product can act on

"95% if we ask forty things" is not a product, so the ceiling is reported as a
function of how many demand classes the profile actually covers, ranked by how
many funds ask about them — never by fund name.

| demand classes covered | CEIL@5 | share of all filter gates covered |
|--:|--:|--:|
| 1 | 33.1% | 15.6% |
| 3 | 43.0% | 36.7% |
| 8 | 48.9% | 47.7% |
| **20** | **56.9%** | 58.8% |
| 30 | 57.7% | 62.1% |
| 50 | 57.9% | 64.7% |
| 150 | 58.7% | 68.4% |
| 300 | 58.7% | 72.6% |
| **all 695** | **65.0%** | 83.6% |

**Twenty questions buys 56.9%. The next 130 buy 1.8 points. The last 8 points
require the remaining 545 demand classes — one per scheme, in its own units.**

That is the practical ceiling, and it is the number to plan against: **a
rich intake a founder would actually complete reaches about 57%, not 65%.**

---

## 7. In the metric the target was set on

CEILING@5 counts each contested leaf once. EXACT@5 counts recall-set *pairs*,
where a fund that wins often is counted often and a fund with no siblings is
trivially alone. `_wscc_exact_bound.ts` re-weights the same key so the two are
never quoted against each other again.

`__recallSetDoors.json`, 7,095 pairs, 6,587 whose won fund is publishable;
**25.7% of those are a fund with no siblings**, alone under every arm.

Pool reach is quoted from the shipped harnesses rather than re-derived —
wsBU measures 93% on holdout, `check_recall_floor` measures 94% on tune. The
table uses the conservative 93%; at 94% every figure rises by ~0.7.

| arm | won fund's class ≤5 | × pool reach 93% | **EXACT@5 ceiling** |
|---|--:|--:|--:|
| TODAY: the six that already rank | 51.5% | | **47.9%** |
| RICH-CRISP C1+C2 | 67.4% | | **62.7%** |
| **RICH FULL C1+C2+F** | 70.9% | | **65.9%** |
| *[circular] verbatim `eligibility_text`* | 83.4% | | *77.6%* |

**The product ships EXACT@5 25%. The target is 95%. The ceiling under full
founder information is 65.9%, and the fully circular reading — the fund's entire
eligibility page handed to a perfect chooser — is 77.6%.**


---

## 8. The pilot — does a model reading a rich profile actually move EXACT@5?

A ceiling is an upper bound under a *perfect* chooser, and wsBU has already
measured that no ranker attains its bound. So the ceiling above is not a
forecast, and step 4 tests the mechanism end to end rather than asserting it.

`_wscc_pilot.ts`, two arms over one pool so nothing differs but the ordering:

- **A — SHIPPED**: the product's own five, unchanged.
- **B — RICH PROFILE**: the top-20 of the shipped ordering, re-ordered by
  `claude-sonnet-5` scoring each fund's **C2 + F** demands — the ones no
  comparator can decide — against a synthesised rich founder profile. A fund the
  judge did not see keeps a neutral score, so nothing is demoted for our silence.

### Leaks, which is where a result like this gets invented

87% of recall-set descriptions once sat inside the won fund's own project
titles, and 1,573 of 1,920 began with the instrument's name. A profile
synthesised from a leaking description hands the judge the answer.

- The profile is built **only** from (company name, country, sector,
  description), and the population is restricted to `isDescribed`, which already
  excludes the leaking rows.
- The profile prompt forbids naming any funder, grant, programme or scheme.
- Every synthesised profile is then tested against **all 891 publishable fund
  names and their 5,517 8-grams** — not against the ones this run happened to
  draw — and dropped if it matches either.
- **The guard is proved to fail before any pair is scored**: the run poisons a
  profile with a real fund name and exits 1 if the guard stays silent. It fires.
- `check_recall_leaks.ts` on the active set: *ok — 1,366 described rows, 0 leaks
  at exact / 8-gram / sibling, 222 squash probes agree.*

Tuning is on `tune`. Holdout is not touched.

### Result

RESULT_PLACEHOLDER

---

## 9. What to do, in order of measured effect

**1. Encode the C1 text we already hold — 939 unencoded filter gates.**
+10.0 points of ceiling (43.1 → 53.1), no founder cost, no fetch cost, no new
question. This is the same shape as the region work, which is the one thing in
this project's history that moved a ceiling. It is wsCB's brief and this
workstream confirms it is the largest single lever.

**2. Add ONE first-page question: what kind of organisation are you.**
The largest demand cluster in the corpus — 619 gates on 384 publishable
instruments — asks whether the applicant is a company, a sole trader, a local
authority, a public body, a university, a research institute, or an association.
It is crisp, every founder knows it instantly, and **no intake field carries it.**
It is the only genuinely unasked C1 property of any size, and wsCA missed it by
reading the bucket as SME status.

**3. Lift the enum constraint in stage 2 — but size the expectation correctly.**
`openFieldsForShortlist` drops every C2 and F requirement before stage 2 sees
them, and the coordinator's diagnosis of the mechanism is exactly right. The
prize is **459 gates on ~300 instruments and 5.0 points of ceiling** (60.0 →
65.0), not thirty. It is worth doing — it is the only route to those five points
and there is no encoder pass that can ever reach them — but it must not be sold
as closing the wsCA gap.

**4. Nothing above gets past ~57% with a question budget a founder will
complete** (§6). Plan against 57%, not 65%.

**What NOT to re-propose**, each now measured rather than argued: any headroom
claim resting on 85.5% or on 62.0% (both circular, §4); a technology question as
a *ranking* lever (wsBA, wsCA §5, and RICH-FUZZY's +2.3 alone here); an encoder
pass over the C2 or F populations (no fixed answer set can exist — §3); and the
95% target itself (§7).

---

## 10. What was changed

Five read-only harnesses under `website/frontend/scripts/`. **No product code.**

- `_wscc_demand.ts` — the demand taxonomy, from the corpus's own gate
  embeddings. Exports `canopy`, `loadGates`, `readPub` so the others share one
  clustering rather than three copies of it.
- `_wscc_ceiling.ts` — the crisp/fuzzy split, the ceiling under a rich profile,
  the granularity sweep that recovers the circular number at τ→1, and the
  question-budget curve.
- `_wscc_classify.ts` — the C1/C2/F/U labelling, cached by text hash so a re-run
  is free. **$0.26.**
- `_wscc_exact_bound.ts` — the same key re-weighted by recall-set pairs, so the
  ceiling can be quoted against EXACT@5 without swapping denominators.
- `_wscc_pilot.ts` — the end-to-end test, with the leak guard.

`python3 -m compileall -q ETL/` clean. `npx tsc --noEmit` clean.
`check_recall_leaks.ts` **ok** — 1,366 described rows, 0 leaks at exact /
8-gram / sibling, 222 squash probes agree.
`check_recall_floor.ts` **ok** — pool 94% (floor 89), EXACT@5 25% (floor 15),
REGIME@5 76% (floor 69), and the three per-population floors. **No floor
touched, no floor lowered.**

**Guards proved to fail rather than assumed green:**

- the pilot's leak guard fires on a deliberately poisoned profile and the run
  exits 1 if it does not — verified by running it;
- an empty `PUBLISHABLE` allow-list exits 1 rather than measuring nothing;
- a missing allow-list file exits 1;
- an empty `DATABASE_URL` exits 1 rather than falling back to SQLite.

No check added here reads gitignored data. No rule, prompt, threshold or weight
in any of the five files names a fund, a country or a sector.
