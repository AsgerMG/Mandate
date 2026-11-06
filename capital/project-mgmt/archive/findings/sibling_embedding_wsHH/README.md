# wsHH — the embedding does separate the two doors, confidently, and its confidence is uncorrelated with the answer

**FOR THE OWNER, VERBATIM.** The hypothesis was that the topic signal is real
in the index and compressed to nothing between exactly the two rows that need
separating. **It is not compressed. It is spent.** On wsHA's 287 pairs the
index has a large opinion about which door matches the founder — a median of
**125 of our 1,088 funds lie between the two doors** in its own ordering, a
median gap of **one full corpus standard deviation** of cosine — and that
opinion picks the door the founder actually won **44.9% of the time (±5.8)**.
Every mechanism the hypothesis named is measurably absent: the percentile map
is a RANK transform of the cosines, so it cannot reverse a pair and **does not,
on 0 of 287**; the 0.35 floor zeroes **both** doors on **0 of 287**; every one
of our 1,088 instruments carries a profile, so nothing is scored zero for
absence; and the two profiles are not one document (**0 identical, median
word-type overlap 0.26**). **So there is no within-sibling-group re-ranking to
build** — any monotone re-expression of the cosines gives the identical order,
which is a proof rather than a measurement, and it is why this workstream spent
no funnel run. The signal is genuinely real one level up and that is the
mechanism worth carrying: the same index puts the won door ahead of a **random**
sibling **73.8%** of the time and first of a median-50 sibling group **51 times
against 9.6 expected by chance** — it narrows the regime to a handful and then
cannot choose inside it, because the door we show is an *equally* good topical
match (**77.0%** against a random sibling, the top sibling 47 times to the won
door's 51). **And it is not the profile's fault.** Re-embedding each door five
ways — its name, its description, its eligibility text, both together, and the
shipped profile as a control that reproduces the live index exactly — puts
every variant on the coin flip: **50.9 / 46.9 / 46.3 / 43.4 / 44.9%**. The two
fields wsHA measured as differing on 95.8% and 79.1% of pairs *do* differ, and
a founder's own words are **not closer to the one they walked through**. That
closes the ordering route for this population and it closes the
better-index route with it: the separating fact is in the world, it is on both
documents, and the founder's description is not evidence about which of the two
it is. What is left is to ask them.

---

```
run                 2026-08-17, isolated worktree wsHH-siblingsem
population          287 sibling-miss pair(s) — wsHA's committed working set,
                    read and never re-derived
draw fingerprint    13cb71cf3a1d1847   <- asserted in code against every line of
                    the evidence file; IDENTICAL to one_funnel/latest.md,
                    rank_shape_wsGY, door_separation_wsHA and use_of_funds_wsHG
corpus              postgres  instruments=1088  instrument_profiles=1088
cost                one Voyage query embedding per founder in each of the two
                    measurement scripts, plus 839 document embeddings, and
                    Postgres reads. ANTHROPIC_API_KEY deleted before import.
                    NO PAID MODEL CALL, NO FUNNEL RUN.
reproduce           OUT=…/wshh_door_cosines_2026-08-17.json    npx tsx scripts/_wshh_cosines.ts
                    OUT=…/wshh_profile_components_2026-08-17.json npx tsx scripts/_wshh_components.ts
                    npx tsx scripts/_wshh_report.ts    (free, offline, no credentials)
```

**Read-only on the product.** `shortlist.ts`, `semantic.ts`, `relevance.ts`,
`memoCandidates.ts`, `caps.ts` and `build_instrument_profiles.py` are untouched.
No flag was added, because §2 shows there is nothing for a flag to switch. The
won door is read off wsHA's evidence file, a harness artifact;
`check_answer_not_reachable.ts` is green.

**No `npm run stages`.** The arm the brief pre-authorised is a within-sibling-group
comparison on raw cosine. §2 proves that arm is a no-op on the door choice
before it is built, so buying two hours of funnel to watch it move nothing would
be buying a number this file already derives. Where an arm remains conceivable
(§3, a within-group RE-NORMALISATION, which is not monotone-equivalent) it is
priced by arithmetic instead, and the arithmetic says it amplifies a 44.9%
signal.

---

## 1. The three cheap deaths, taken first

The brief named three candidate mechanisms and one upstream check. All four are
measurable on the pairs alone and all four come back negative.

```
  every instrument carries a profile        1088/1088   nothing is scored 0 for absence
  identical profile_text on the two doors      0/287
  BOTH doors below RELEVANCE_FLOOR (0.35)      0/287    the floor never flattens a pair
  raw and percentile DISAGREE on a pair        0/287
```

**Coverage.** `rel(i)` reads `relevance.get(i.id) ?? 0`, so a fund missing from
`instrument_profiles` is indistinguishable from a thematically wrong one. The
index is complete — 1,088 of 1,088 — so this cannot be happening to anybody.

**The profiles are not one document.** wsHG and `shortlist.ts` both quote a
same-name sibling cosine of 0.947, which is what made "the profile text itself is
near-identical" a live hypothesis. On these pairs it is not:

```
  door-to-door profile cosine    min 0.655   p25 0.818   MEDIAN 0.845   p75 0.869   max 0.965
  word-type jaccard              min 0.111   p25 0.227   MEDIAN 0.256   p75 0.284   max 0.622
  profile chars, won door        p25 1,140   MEDIAN 1,422   p75 2,627
```

A quarter of word types shared and a cosine of 0.845 in a corpus whose whole
similarity band is roughly 0.28–0.47 is **two related documents, not one**.
`build_profiles` is doing its job; the defect is not upstream of the ranking.

**The floor never zeroes both.** It is below one door on 16 pairs and below the
other on 17, and below both on none — so on the 33 pairs where it acts at all it
*widens* the gap by zeroing the loser. It cannot be the thing collapsing a pair
to a tie, because it never produces one.

## 2. Why there is no arm to build, and it is a proof rather than a measurement

`semanticFundMatch` returns `(n - 1 - i) / (n - 1)` where `i` is the row's
position in a scan ordered by distance. **That is a rank transform.** A rank
transform is strictly monotone by construction, so for any two funds it
preserves the order of their cosines exactly, and **every strictly monotone
re-expression of a cosine gives the identical within-group ordering.** The
measurement confirms it on 0 disagreements out of 287, which is what a proof
looks like when you check it anyway.

So the only ways the percentile map can change a door choice are the two the
code actually contains, and both are measured above: the FLOOR (§1: never
flattens a pair) and ABSENCE (§1: never happens). There is no third.

What the transform *does* do is change the SIZE of the gap, and the direction is
the opposite of the hypothesis. Raw cosines occupy a narrow band; percentile
ranks use the full [0,1] by construction. **The percentile map is the
expansion, not the compression:**

```
                                  min      p10      p25   MEDIAN      p75      p90      max
  raw cosine gap, won - shown  -0.1111  -0.0627  -0.0313  -0.0060   0.0338   0.0816   0.1863
  percentile gap, won - shown   -0.856   -0.282   -0.138   -0.006    0.064    0.305    0.870
  |raw gap| in corpus sd          0.00     0.17     0.51     0.97     1.76     2.60     6.05
  instruments lying between          0        8       27      125      258      511      945
```

A median of **125 instruments between the two doors** is the number that retires
"two adjacent siblings differ by one or two percentile ranks". They are not
adjacent. The index is not quiet about these pairs; it is loud, and it is
pointing in a direction that has nothing to do with the answer.

## 3. What the index is actually right about — and where the signal runs out

The pair is conditioned on our own ranker having put one of the two doors on the
page, so 44.9% cannot be read against 0% and called a 45-point gain. **The null
on this population is 50%**, and it is not asserted, it is measured: a door's
NAME is not read by the ranker in any form, and name-similarity picks the won
door on 50.9% of the pairs (§4). Anything independent of today's ordering lands
at the coin flip; anything correlated with it lands below.

The selection-free reading is against the sibling group, which the regime fixes
and our ranker does not:

```
  sibling group size            p25 43   MEDIAN 50   p90 103
  won door's rank in it         p25  2   MEDIAN  7   p90  35
  shown door's rank in it       p25  2   MEDIAN  7   p90  35

  won   beats a RANDOM sibling   73.8%      (chance 50.0%)
  shown beats a RANDOM sibling   77.0%
  won   beats the SHOWN sibling  44.9%      (null 50.0%, §4)

  won   is the top sibling       51/287     (9.6 expected by chance)
  shown is the top sibling       47/287
```

**Read the three rows in order and the mechanism is the whole finding.** The
index carries real topical information: it beats a random sibling three times in
four and puts the won door first out of fifty about five times more often than
chance. It spends all of that narrowing fifty doors to a handful. **Inside the
handful it has nothing left**, because the door we show is exactly as good a
topical match as the door they won — 77.0% against 73.8%, top-sibling 47 against
51. This is `rank_shape_wsGY.md` §3's "the score is indifferent, not biased"
holding at the resolution wsGY could not see, on the one signal wsGY did not
decompose.

**The one arm this leaves conceivable, priced without buying it.** A within-group
RE-NORMALISATION — percentile among the siblings rather than among the 1,088 —
is *not* monotone-equivalent, because it changes the theme term's magnitude
against `sectorFit` in `THEME_WEIGHT * rel + (1 - THEME_WEIGHT) * sectorFit` and
therefore how often theme decides the door at all. It cannot reverse a pair;
it can only let theme decide more of them. Theme decides them correctly 44.9% of
the time. **An arm that amplifies a coin flip gains only if what it displaces is
worse than a coin flip**, and nothing in `rank_shape_wsGY.md` §3 is: every
feature there sits within four percentile points of the answer, which is
indifference, not anti-correlation. That is the same arithmetic
`A_POPULATION_PRIOR_IS_NOT_A_ROW_SIGNAL` states for a binary prior, arriving at
a continuous one.

## 4. It is not the profile's composition either — every section is on the flip

The live objection to §3 is that `profile_text` is nine sections of which the
funded-project titles, the register activity lines and the child-scheme names
are all AWARD HISTORY, while wsHA measured the doors differing in their
DESCRIPTION (95.8%) and ELIGIBILITY TEXT (79.1%) — the two a founder's own words
are about. If the topic signal is in there and drowned by forty award titles,
the fix belongs to `build_profiles` and not to `shortlist.ts`.

Each of the 174 distinct doors was re-embedded five ways with `input_type
"document"`, against the same founder queries with `input_type "query"`, and
asked the same question:

| document | won > shown | rate | 95% half-width | no text on one side |
|---|--:|--:|--:|--:|
| `name` | 146/287 | **50.9%** | ±5.8 | 0 |
| `description` | 129/275 | 46.9% | ±5.9 | 12 |
| `eligibility_text` | 105/227 | 46.3% | ±6.5 | 60 |
| `description + eligibility` | 122/281 | 43.4% | ±5.8 | 6 |
| `profile_text` *(control)* | **129/287** | **44.9%** | ±5.8 | 0 |

**The control is exact.** Re-embedding `profile_text` reproduces the live
pgvector index on 129/287, the same pairs and the same count — so this table is
measuring the index that ships, not a re-implementation of it. A door with no
text for a variant is dropped from that variant's tally and the drop is
reported, so no variant can look good by answering only the pairs that suit it.

**`name` is the null, and it is worth more than the other four rows.** No
ranking path in this product computes a similarity against a door's name — the
one place a name is read at all is `demoteSchemeRepeats`, which keys on
`schemeCode` and orders nothing on text. So this row is a signal the selection
did not use, and it lands at **50.9%**: the coin flip this population is worth.
That is what makes 44.9%, 46.3% and 43.4% readable as *nothing* rather than as
*slightly negative*, and it is measured rather than assumed, which matters
because a pair conditioned on our own top pick has no a-priori null.

The one caveat cuts the safe way. A door's name is also the FIRST LINE of its
`profile_text`, so `name` is not perfectly independent of the shipped signal —
and a contaminated null is pulled TOWARD the 44.9% it is being used to judge.
50.9% is therefore a conservative floor on the null, not an optimistic one.

It is also the test bench this workstream leaves behind: **a candidate separator
has to beat 50.9% on these 287 pairs, and that check is free, offline and takes
seconds.**

## 5. The null is spread, and the largest block is the least dead

`rank_shape_wsGY` and wsGX both report how far a result reaches; a null owes the
same disclosure, because a null concentrated in one agency is not a null.

| regime | n | share | raw won>shown | won vs random | door cosine |
|---|--:|--:|--:|--:|--:|
| `vinnova_grant` | 126 | 43.9% | 68/126 **54.0%** | 81.4% | 0.841 |
| `satr_fr_rnd` | 45 | 15.7% | 19/45 42.2% | 61.8% | 0.866 |
| `satr_de_rnd` | 32 | 11.1% | 13/32 40.6% | 72.2% | 0.848 |
| `satr_it_rnd` | 24 | 8.4% | 12/24 50.0% | 70.9% | 0.858 |
| `horizon_eu_pillar_ii` | 15 | 5.2% | 5/15 33.3% | 83.7% | 0.797 |
| `ademe_aid` | 11 | 3.8% | 2/11 18.2% | 64.6% | 0.838 |
| `horizon_eu_partnership` | 11 | 3.8% | 1/11 9.1% | 49.5% | 0.801 |
| everything below 2% | 23 | 8.0% | 9/23 39.1% | — | — |

**Eleven of the fifteen regimes sit at or below the flip, and they carry 154 of
the 287 pairs (53.7%).** No block is being dragged down by another.

The one honest exception is the largest. **`vinnova_grant` reads 54.0% (±8.7) —
the only regime above the null with more than 24 pairs**, and it is the block
wsHA names as the one whose separator is the founder's own line of business.
It is not significant and this file does not claim it. What it does mean is
that if anybody re-opens the topic route, Vinnova is the 126 pairs to re-open it
on, and 54.0% is the number to beat — not 44.9%, and not zero.

## 6. What this closes, and what it does not

**Closes.** *The ordering route on the sibling-miss population, for the semantic
term specifically.* Not "we measured a re-ranking flat" — no re-ranking exists
to measure, because the transform between the raw cosine and the percentile is
monotone and the two exceptions it contains (the floor, absence) fire on zero
pairs. This composes with `use_of_funds_wsHG` §7 rather than repeating it: wsHG
found that a *perfect* answer to the largest statable separator moves
`gates_pass` by zero and the funnel by −0.1 because of the WIRING; wsHH finds
that the largest *already-wired* separator carries no information at this
resolution to wire. **Two different signals, two different failure modes, one
conclusion: the ordering machinery is not where the 30.5 points are.**

**Closes with it.** *The "build a better profile" route, as a fix for THIS
population.* §4 is the strong form: it is not that our profile is a poor
rendering of the topic, it is that the founder's own words are not closer to the
door they walked through than to its sibling, on any rendering we can make of
either door. A workstream proposing to rebuild `instrument_profiles` for
sibling separation should run `_wshh_report.ts` first; it costs seconds.

**Does NOT close.** *That the doors are separable.* wsHA proved the fact exists
on 287 of 287 and wsHG's oracle picks the won door on 64 of 86 pairs where both
declare a registered purpose. Both stand untouched. What wsHH removes is one
candidate CARRIER of that fact — the founder's description, through the vector
index — and it removes it cleanly.

**Does NOT close.** *The intake.* This is the third independent workstream to
land on it, and the three now agree from different directions: wsGY (nothing we
hold separates the shown rows from the answer), wsHG (the field separates on 64
of 86 — a real founder is asked and states it; award prose cannot supply it),
and wsHH (the one signal built from the founder's own words is a coin flip at
this resolution). **A ceiling measured on today's questions bounds today's
questions.** The description these 287 founders query with is award prose
recovered from a *different regime* — it is what the company did, not what they
want the money for, and §4 says a fund's own description is not what it matches
on. That is not an argument that the route is impossible; it is an argument
that we are asking the wrong text to carry it.

**Cannot see.** The model. `agentSelectMemoPool` re-orders the 40 and every
figure here is model-free. The paid ranker answers to `rank_shape_wsGY.md` §1's
71.7% menu ceiling, and nothing in this file bounds what a model reading two
descriptions side by side would do with them — it bounds what a *cosine* between
one of them and a founder's prose does, which is a much narrower claim.

---

## Files

- `README.md` — this finding.
- `project-mgmt/evidence/wshh_door_cosines_2026-08-17.json` — every pair, both
  doors, raw cosine, global rank, percentile, sibling rank, corpus dispersion,
  door-to-door profile similarity.
- `project-mgmt/evidence/wshh_profile_components_2026-08-17.json` — §4, five
  documents per door.

## Reproduction

- **`website/frontend/scripts/_wshh_cosines.ts`** — §§1–3, 5. One Voyage
  embedding per founder and one full scan of `instrument_profiles` per founder,
  the query built verbatim from `semanticFundMatch` including its
  `instrument_id` tiebreak. Refuses `NO_PG`, refuses a non-Postgres store, and
  refuses an evidence file that is not on the funnel's draw.
- **`website/frontend/scripts/_wshh_components.ts`** — §4. Re-embeds each of the
  174 doors five ways; the `profile` variant is the control and reproducing the
  live index is the condition for reading the other four.
- **`website/frontend/scripts/_wshh_report.ts`** — every figure above. Offline,
  no credentials, no model, no database; imports `RELEVANCE_FLOOR` from the
  product rather than restating it, so a change to the floor cannot leave this
  report describing one that no longer ships.
