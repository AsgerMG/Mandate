# wsHE — the award band is backwards, removing it moves the number +2.5 points, and every one of those points is Sweden

**FOR THE OWNER, VERBATIM.** Yes, the award band works backwards, and the reason
is arithmetic rather than subtle: a founder's stated band is a RAISE, a fund's
`awardP50` is what one scheme pays into one project, and **89.2% of the funds
people actually won pay LESS than the band they stated — a median 0.81 decades
below it, a factor of six and a half.** So does most of what we show them, but
less far below. A symmetric closest-to-the-ask rule whose target sits above
almost every candidate is not a proximity rule at all: it silently becomes
**"prefer the larger payer"**, and the larger payer is the wrong door 68.2% of
the time. That is the whole of wsHA's 33.1%-against-5.6%. The lower-quartile fix
was ruled out for free — reading a smaller statistic off BOTH doors moves both
further below a target that was already above both, so **the target is wrong,
not the statistic**. Removing the term moves the end-to-end number **from 35.8%
to 38.2% at six rows (+2.5, McNemar z=3.4, p<0.001)** with no wsBU trade — REGIME
and CHANNEL both edge up, not down — and it is the first thing in four days to
move it. **And then the honest half: take `vinnova_grant` out of the population
and the gain is +0.4 at z=0.9, indistinguishable from nothing.** Inside Vinnova
it is +9.1 points. One regime, 23% of the founders, is carrying the entire move.
The mechanism says why and it is not an excuse: Vinnova is seventeen small-grant
programmes that are genuinely told apart by what a founder does for a living, so
deleting a wrong-signed tie-break lets the right signal decide — while in the
state-aid regimes the siblings are near-identical register text and there is no
better signal queued up behind it. **The defect is everywhere; the payoff is
only where something better was already waiting.** So this is a real +2.5 on the
headline and a real fix to a real defect, and it is not a general improvement to
ranking. My proposal is default ON anyway, because a signal measured pointing
the wrong way should not keep shipping — but the decision to move the headline
on one market's gain is yours, and the flag is one word either way.

---

```
run                 2026-08-17, isolated worktree wsHE-award, ONE session
population          897 founder(s) — held out, described, one per company, drawn
                    BEFORE the offerability cut
draw fingerprint    13cb71cf3a1d1847   <- IDENTICAL in all three runs, asserted
                    in code by `_wshe_arms.ts`, and identical to
                    `one_funnel/latest.md` and `door_separation_wsHA/`
corpus              postgres instruments=1088
ranker              all 828 request(s) on EMBEDDING, on every run reported here
cost                one Voyage embedding and one gate hydration per founder.
                    ANTHROPIC_API_KEY deleted before import. NO PAID MODEL CALL.
reproduce           IN=/tmp/wsha_doors.json npx tsx scripts/_wshe_award.ts   (free, ~20s)
                    AWARD_TERM=<arm> OUT=... npx tsx scripts/_wsha_doors.ts  (~15 min)
                    A=... B=... npx tsx scripts/_wshe_arms.ts               (free)
```

**PAIRED WITHIN ONE SESSION.** All runs below were taken between 21:02 and 22:20
on 2026-08-17 against one store, and the baseline reproduces
`door_separation_wsHA/` exactly — 774 gates-pass, 321 at six rows, 287 sibling
misses, 388 same-channel — so the corpus did not drift under them. Nothing here
is compared against another workstream's run from another hour.

**`npm run stages` WAS NOT RUN, and that is deliberate.** The coordinator
corrected its cost mid-task (about two hours, not eighteen minutes) and two other
funnel runs were executing on this machine; a third concurrent load already cost
one of my arms to a `requireCleanRanker` ranker timeout. `_wsha_doors.ts` walks
the SAME path — `buildInstrumentTableHydrated` → `accessiblePool` →
`orderMemoCandidates` → the six rows — reproduces the funnel's own rows to the
founder, and additionally carries REGIME, CHANNEL and per-founder regimes, which
`measure_funnel` deliberately does not. The ladder below is that path's, with
the two rungs it cannot see named as missing rather than omitted.

---

## The three files, and what each answers

| file | the question |
|---|---|
| `TRACE.md` | §1 — WHERE an award band enters the order a founder sees. Five sites, three live, and one of them is the writer's prompt. |
| `DIRECTION.md` | §2 — is it backwards, or is the answer key odd? Both, and they are the same fact. |
| `RESULTS.md` | §3 — does fixing it pay end to end, with REGIME, CHANNEL and concentration beside the gain. |
| `ARMS_off.md`, `ARMS_oneside.md` | the raw paired output of `_wshe_arms.ts`, unedited. |

## THE SHIP DECISION

`AWARD_TERM` is a module-scope flag in `lib/intelligence/shortlist.ts`, **default
`shipped`** — today's behaviour bit for bit. Three values:

| value | what it does |
|---|---|
| `shipped` | today. The DEFAULT as committed. |
| `off` | `awardScorer` returns 1 for every fund. |
| `oneside` | penalise only funds paying MORE than the whole ask; neutral at the ceiling for anything at or below it. |

**I am proposing `oneside` default ON.** The evidence, stated plainly so it can
be disagreed with:

- **For.** The signal it replaces is measured pointing the wrong way inside the
  cell where the product's residual failure lives (33.1% against 5.6%), and the
  mechanism is understood rather than fitted. Its removal is worth +2.5 EXACT@6
  at p<0.001, and REGIME and CHANNEL both move UP, so nothing is being bought
  with something. `oneside` over `off` because the two are statistically
  identical (+0.1, p=0.705) and `oneside` keeps the one half of the original
  judgement the evidence does not contradict — a scheme whose typical cheque is
  far larger than the entire ask is answering a different question.
- **Against, and it is not small.** The whole +2.5 is `vinnova_grant`. Outside
  it the arm is +0.4 at z=0.9. Turning this on moves the headline on the
  strength of one national agency's programme structure, and the headline is the
  number this project steers by.
- **Not a reason either way.** The `awardScorer` cost is unchanged and the arm
  cannot alter offerability, gates or the corpus — every funnel rung above the
  pool cut is identical across all three arms, which is asserted in `RESULTS.md`
  rather than assumed.

Flipping it is one word: `parseAwardTerm`'s `v ?? "shipped"`. The unit test
`awardTerm.test.ts` asserts the current default and would have to be changed
with it, deliberately, so the flip cannot happen by accident.

## What this does NOT close

**Site 5 of `TRACE.md` is untouched and unmeasured.** The writer's prompt still
carries `Ticket sought: EUR 500k–2.5M` in the founder profile and
`typical award EUR 172k over 75 real awards` on every row. Whatever matching the
model does between those two numbers survives every arm here, and it is the LAST
selector in the chain. Measuring it costs one paid call per founder. If the
score-side fix is taken and the number moves less in production than it does
here, that is the first place to look — the model may be re-applying the
arithmetic we just removed.

**The intake question itself is a lever, not a fixture.** The cleanest version
of this fix is not in the ranker at all: the first screen asks for a round and
the corpus answers in grant tranches, and `ticketBand` could ask for the two
separately. That is an intake change and it belongs to whoever owns the intake.
