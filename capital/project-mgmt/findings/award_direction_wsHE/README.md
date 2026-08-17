# wsHE — the award band works backwards because its target sits above the corpus, and fixing it is the first thing in four days to move the number

**FOR THE OWNER, VERBATIM.** Yes, the award band is working backwards, and the
reason is arithmetic rather than subtle. A founder's stated band is a RAISE; a
fund's `awardP50` is what one scheme pays into one project. Measured on wsHA's
287 sibling pairs, **89.2% of the funds people actually won pay LESS than the
band they stated, a median 0.81 decades below it — a factor of six and a half.**
So does most of what we show them, but less far below. A symmetric
closest-to-the-ask rule whose target sits above almost every candidate is not a
proximity rule at all: it silently becomes **"prefer the larger payer"**, and the
larger payer is the wrong door 68.2% of the time. That is the whole of wsHA's
33.1%-against-5.6%. The lower-quartile fix does not work and cost nothing to
rule out — reading a smaller statistic off BOTH doors moves both further below a
target that was already above both. **The target is wrong, not the statistic.**
Making the penalty ONE-SIDED — a scheme that pays less than the whole ask is not
thereby a worse route, a scheme paying far more is answering a different
question — moves the end-to-end number **from 35.8% to 38.2% at six rows
(+2.5 points, McNemar z=3.4, p<0.001)**, and it is not a wsBU trade: REGIME and
CHANNEL both edge UP, and inside the sibling cell it converts 28 founders to the
right door while pushing 8 the other way. **The caveat is real and it is
concentration: 78% of the gain is Vinnova**, which is 24% of the misses. The
mechanism explains it — Vinnova's sibling groups are large and uniformly
small-paying, so a wrong-signed tie-break did the most damage there — but this
is a fix that lands hardest in one market, and it should be read that way.

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
