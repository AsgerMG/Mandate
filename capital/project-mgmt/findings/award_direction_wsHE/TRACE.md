# wsHE §1 — where an award band enters the order a founder sees

The brief asked this first, because "it is in the score" and "it is in the
prompt" imply different fixes. The answer is BOTH, at five sites, and only three
of them are live.

| # | site | what it compares | shape | live today |
|---|---|---|---|---|
| 1 | `selectLeafInstruments`, `shortlist.ts` (`target = TICKET_MIDPOINT[ticketBand]`) | `typicalAward(i)` against the ARITHMETIC band midpoint | a LINEAR tie-break, deep in the leaf sort, reached only when the rounded theme+sector score ties | yes, but near-inert |
| 2 | the sibling reassignment, `shortlist.ts` (`awd = awardScorer(leaves, input.ticketBand)`) | `awardP50` against the GEOMETRIC band midpoint | order-of-magnitude multiplier, ceiling 1.35 | **yes — this is the site wsHA measured at 33.1% / 5.6%** |
| 3 | the row multiplier, `shortlist.ts` (`ticketFit`, multiplied into `rowRelevance`) | the same `awardScorer`, over the whole selection | the same multiplier, applied ACROSS channels | **yes** |
| 4 | `poolBlend.ts` columns `award scale fit` (+0.403) and `award median` (**−0.657**) | `scaleFit` (a Gaussian in log-decades) and the raw median | fitted conditional-logit weights | **no** — `POOL_BLEND` defaults to `off` |
| 5 | the WRITER'S PROMPT | `eligibilityContext` prints `Ticket sought: <band label>`; `agentSelect`'s row line prints `typical award EUR X over N real awards, half between EUR P25 and EUR P75` | natural language, matched by a model | **yes**, and unmeasurable for free |

Three things follow, and they are the reason the deliverable is not a one-line
answer.

**Sites 2 and 3 are the same function.** `awardScorer` is called twice per
request — once inside the rank-preserving sibling reassignment, which may only
change WHICH sibling holds a channel's slot, and once as a multiplier on the row
score, which is explicitly allowed to move a row across channels. A flag on
`awardScorer` therefore governs both, which is what `AWARD_TERM` does.

**Site 1 is a different function on the same idea and is left alone.** It reads
`typicalAward` (which falls back to `totalEur / eventCount`) against the
ARITHMETIC midpoint, linearly, as a tie-break after `Math.round(score * 1e6)`
already separated the candidates. It also cannot change pool MEMBERSHIP:
`POOL_LEAVES_PER_CHANNEL` sits far above the widest real sibling group, and
`check_leaf_cap.ts` fails the build when that gap closes. Folding it into the arm
would make a result that moved unattributable between two different rules.

**Site 5 is not reachable from any of this.** Removing the score term does not
remove the ask from the writer's prompt or the medians from its rows. Whatever
matching the model does between "Ticket sought: EUR 500k–2.5M" and "typical
award EUR 172k" survives every arm below, and measuring it costs one paid call
per founder. That is the standing reason an end-to-end number here can be flat
while the score-side defect is real: **the last selector in the chain reads both
numbers in prose.**
