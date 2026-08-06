# What 95% arithmetically requires

Written 2026-08-06 while three workstreams were running, because all three were
aimed at "improve the ranking" without anyone having checked what the target
decomposes into. It turns out to constrain the design hard enough that it
changed two of the three briefs.

Method: `funding_instruments` joined against the 2,817 holdout pairs of
`__recallSetComposed.json`. No ranker code involved, so nothing here depends on
the state of `shortlist.ts`.

## The group we have to order is large, and there is no easy tail

Regime size (`parent_id` group) of the fund each company actually won:

```
p10  12      median  76      p75  88      p90  103      max  103
regimes with ONE member (nothing to separate)      0   ( 0%)
regimes with <= 5 members                         90   ( 3%)
```

Every won fund sits inside a crowd. 97% of them sit in a crowd of more than
five. Any plan that hopes part of the corpus is easy is wrong about this corpus.

## The decomposition

> **RE-DERIVED 2026-08-06 23:xx CEST, workstream K. The conclusion below did
> not survive intact — it got STRONGER, and it moved to a different factor.**
>
> As written, this section read:
>
> ```
> EXACT@5  =  P(in pool)  x  P(regime reaches the five)  x  P(right leaf)
>    36%   =      97%     x           89%                x          40%
> ```
>
> Every one of those four numbers came from a STRIDE-sampled n=200 run.
> `95f5fce` showed the sampler aliased against the set's ordering (N=200 gave
> EXACT@5 36%, N=250 gave 25%, same code), and `dac300a` showed the harness
> additionally decayed along a run. Neither 36% nor 97% is reproducible under
> an unbiased draw. See the re-baseline below.

Measured on the seeded shuffle, holdout, n=600 per seed, three seeds, on a
leak-free index — the population is the 2,817 holdout pairs of
`__recallSetComposed.json`:

```
EXACT@5  =  P(in pool)  x  P(regime reaches the five)  x  P(we pick the right leaf)
   24%   =      75%     x           87%                x          37%
```

The third factor is still derived, not measured directly. What changed is
which factor binds.

**The pool is now the ceiling, and it was previously assumed closed.**
`diagnose_rank.ts` still opens with "the pool question is closed (SEL-LEAF-CAP,
fixed by raising the cap)". It is not closed. EXACT@5 cannot exceed P(in pool)
however perfect the ranking, so at pool 75% the arithmetic is:

| target | needs pool of at least | reachable at pool 75%? |
|---|--:|---|
| 95% | 95% | no — 20 points short before ranking is considered |
| 89% | 89% | no |
| 75% | 75% | only with a PERFECT regime and a PERFECT leaf choice |

**The old conclusion — "no version of 95% exact that does not require
near-perfect regime recall AND near-perfect leaf choice" — still holds, and is
now the second-order problem.** The first-order problem is that a quarter of
won funds never reach the candidate set at all, and no amount of reordering can
rank a fund that is not there. Ranking tweaks were never going to get to 95%;
they now cannot get past 75%.

Read `project-mgmt/findings/leak_audit_wsK.md` before acting on this. The pool
fall from ~95% to ~75% happened between 18:53 and 21:09 UTC on 2026-08-06 and
its cause is **recorded as unresolved** — it is measurably NOT the leak that
workstream closed (an index rebuilt with and without the holdout at the same
moment reads pool 78% both ways), and the two remaining candidates, a stale
index and a wholesale gate-layer rewrite, could not be separated because the
previous index was overwritten. Do not build a plan on the 75% until that is
settled: it may be a regression to fix rather than a ceiling to design around.

## The structural consequence

Workstream E measured that among the 125 holdout cases where the won fund is in
the pool but below the cut, the share where *the regime holds a slot and the won
leaf is its best member* is **0%**. There is no case that was lost for lack of a
seat once the regime was ordered correctly.

Two things follow.

1. **Collapsing rows to one per regime converts regime@5 into EXACT@5 almost
   one-for-one.** The seat was never the binding constraint; the representative
   was.

2. **Collapsing frees seats.** A mean of **3.07 of the five rows are currently
   siblings of one regime** — three seats on one programme, none of them the
   right leaf. One row per regime makes the five rows five distinct programmes,
   which should lift regime@5 above 89% at no cost, because two seats stop being
   spent on a choice we are getting wrong anyway.

This is also the product's own promise. Five rows that are three flavours of one
regime are not "five specific funds to apply to", whatever the recall number
says.

## The ceiling of region, stated before we tune toward it

Region is the only measured separator (44-66% @1 within groups). Its physical
ceiling is the **94.4% NUTS-1 self-agreement** of a company's own awards — a
company's region does not identify its leaf more reliably than the company's
own award history agrees with itself.

So region alone tops out near 94% on the third factor, which with a perfect
pool and perfect regime recall lands short of 95% end to end. **A second
separator, orthogonal to geography, is required.** That is a statement about the
design, not a prediction about any one experiment, and it should be checked
against measurement rather than believed.

## What this rules out

- Tuning global sort weights. They move the third factor by points; it needs
  tens of points.
- Any plan that reaches 95% exact while regime@5 sits below ~99%.
- Treating region as "one more signal". Under the collapsed shape it is not a
  signal in a sort, it is the answer to a single question per regime.
