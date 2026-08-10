# End-to-end audit: everything between a founder and a chosen fund

Written 2026-08-10 with the API budget closed. **Every number here was read out
of committed artifacts, the corpus or the code. Nothing was measured by
spending.** The purpose is that tomorrow's first paid run is the one that
answers the question, rather than the one that discovers the harness.

---

## 1. The blocker, located exactly

**5,670 of the 7,095 answer-key pairs — 79.9% — carry no founder description at
all.** `descriptionSource: "none"`. In the selector prompt they render as the
literal string `(no description on file)`.

So for four founders in five, the model is asked which of ~105 public funding
schemes a company should apply to, knowing only:

```
name, country, sector, ticket band, use of funds, consortium yes/no
```

That is not a hard version of the task. **It is a different task** — and it is
one the empirical prior is structurally better at, because the prior never reads
prose. It keys on the founder's peer cell, which stays distinct when the text
does not.

**Every model arm measured so far ran under this condition.** The comparison
"model 15-20% vs shipped 27%" is therefore not a comparison of judgement against
ranking. It is a comparison of *a judge with no case file* against *a ranker
that never needed one*.

### The population that would settle it already exists

| | |
|---|--:|
| pairs with a real, prose description | **262** |
| — of which tune / holdout | **118 / 144** |
| median length | **1,000 characters** |
| countries / sectors covered | 5 / 11 |
| distinct won instruments | 76 |
| source | `cross_regime_summary` (249), `cross_regime_title` (13) |

**118 tune cases is the same size as every arm already run (N=120).** Re-running
the existing arms restricted to this population costs roughly **€1.60** and is
the single most informative euro available.

**It is leak-safe by construction**, which is why it is usable at all:
`cross_regime_summary` means the text comes from an award under a *different*
regime, so it cannot name the fund being predicted. This is the same control
that took the leaking descriptions out of the set in the first place — 87% once
sat inside the won fund's own project titles, and 1,573 of 1,920 began with the
instrument's name.

### What a real description actually looks like

> *Le projet consiste à développer un procédé innovant de fabrication de poudres
> abrasives d'oxyde de cérium de haute pureté et cristallinité, afin de …*

A thousand characters naming the technology, the process and the purpose. That
is what the production intake asks for — *"What are you building? (a sentence or
two)"* — and it is what no model arm has ever been given at scale.

---

## 2. The window: the answer is sometimes not shown

The selector runs at `depth=40`. The candidate pool is **min 25, median 105, max
185**. In the first prompt dumped for inspection, the fund the company actually
won sat at **pool rank 49** — outside the model's view entirely. That founder
was unwinnable before the model read a word.

**The shipped ranker orders the whole pool.** So the arms as run gave the model a
handicap nobody intended, and every headline comparison inherits it.

Two fixes, both free to apply:
- show the whole pool (105 rows × ~530 characters ≈ 55k characters, affordable), or
- keep the window and **quote the arm against its own ceiling**, not against
  shipped. At depth 40 that ceiling is 74%; at full pool it is 95%.

---

## 3. The prior the model is judged against is 44% inference

`applyPeerPrecedence` copies the order in `peerPrior.generated.json`. **44% of
its slots are held by inference rather than observation**, and the effect is not
theoretical: a film and television scheme is credited to an AI company by **215
awards from 170 genuine German software companies under *other* schemes**. A
perfect taxonomy fix — 2,738 companies corrected — moved that row not at all,
because the row was never ranked by the score.

This cuts twice:
- the **baseline** is inflated wherever inference happens to land on the answer;
- the **adviser arm feeds that same prior to the model as evidence**, asking it
  to adjudicate against a confident wrong signal.

The crediting join in `emit_peer_prior.py` is unexamined and is the highest-value
untouched thing in the pipeline.

---

## 4. What the mechanism data already says, before any model is involved

From the stage tape (tune, 250 replays, attested):

| cause of a miss | count | winnable (class ≤ 5) | not |
|---|--:|--:|--:|
| the score never lifted it | 146 | 74 | 72 |
| the late re-order pushed it out | 20 | 13 | 7 |
| absent from the pool | 15 | 15 | 0 |

- **87 misses are winnable and reachable by reordering**, and every one has a
  score of its own — **zero ties**. Nothing is blocked by indistinguishability.
- But the median winnable miss sits **33.8% below the fifth row's score**. Only
  21 of 87 are within 5%. So a small nudge cannot fetch them; a genuinely
  different judgement could.
- **The won leaf sits below at least one row it OUTSCORED in 180 of 250
  published orders**, median 8 such rows. That is the prior overruling the score
  wholesale, and it is exactly the seam a model would have to arbitrate.
- Causes are spread, not concentrated: the score's 146 misses span **47 regimes,
  largest 14%**.

---

## 5. Legacy and debt that could block a clean test

| item | state | why it matters |
|---|---|---|
| `fundSelection.ts` | exists, **no production caller** | an older LLM selector. Its recorded finding — "every configuration that lets the model REORDER has measured at or below gate 1" — was reproduced independently this week. Keep the finding, delete the file or wire it. |
| the harness's founder | 18 of 23 intake fields never supplied until today | fixed by `founderIntake.ts`; the oracle cap moved 91.6% → 98.4% when it landed. **Any pre-2026-08-10 measurement inherits the fictional founder.** |
| `check_recall_floor` ranker averaging | fixed 2026-08-09 17:15 | before that, runs silently averaged the embedding and lexical rankers under load. **39 of 53 replay artifacts predate attestation.** |
| `POOL_BLEND`, `SIBLING_SCOPE`, `CHANNEL_BACKFILL`, `AGENT_SELECT` | flags, default off | each is the reproducibility arm for a measured result. Legitimate — but every one is a path that does not run in production, and none may be quoted as shipped behaviour. |
| 3 pre-existing `npm run check` failures | stale census, degraded index freshness, page attribution | none is in the selector's path, but they mean `npm run check` cannot currently be used as a clean gate. |

---

## 6. The test order for tomorrow, cheapest and most decisive first

1. **The described-founder arm.** Re-run `rows` and `assist` restricted to the
   118 tune pairs with a real description, against shipped on the same 118.
   **~€1.60.** If the model closes the gap here, the architecture is vindicated
   and the harness is the fix. If it does not, the architecture is in genuine
   doubt and we have spent €1.60 to learn it.
2. **The full-pool arm.** Same cases, `depth` at full pool rather than 40.
   Isolates the window handicap. **~€3.**
3. **Only then**, the adviser with thinking and retrieval — because until 1 and
   2 land, its extra machinery is being measured on an impossible task, which is
   exactly what produced its 15%.

**Do not run 3 before 1 and 2.** The adviser arm being the *worst* of the three
is the strongest available evidence that the inputs, not the reasoning, are the
constraint — and it is cheap to prove that before spending on reasoning again.
