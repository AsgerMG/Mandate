# The blend's largest weight is PROXIMITY, and `rowRelevance` has no home-country term. Does putting one in the order that feeds the POOL CUT move the funnel?

**Workstream GX · 2026-08-13 · isolated worktree off `main` at `7c6e97bd`.**

> DRAFT — the funnel arms are running. Nothing below the prior is final.

## 0. The prior, established first because it decides whether this is worth running

The standing memo already records **"address / territory — a perfect lookup is
+0.4 tune, +0.0 holdout"**, and the brief asks whether that closed the same
thing. **It did not.** `address_door_wsCJ.md` measured a different mechanism at
a different scope:

| | wsCJ (closed) | `proximity` (this study) |
|---|---|---|
| what it chooses between | SIBLING LEAVES of one notified scheme, delivered by different territorial bodies | every row in the pool |
| the key | the founder's registered ADDRESS against a body's remit (NUTS, *Finanzamt*, *Bezirksregierung*) | the fund's COUNTRY against the founder's |
| how much of the corpus it can touch | **76 of 1,088 instruments (7.0%)** are territorial at all | every instrument has a country |
| what it does to the ORDER | nothing — it is a within-family tie-break at the leaf | it is a term in the score the whole table sorts on |
| where it acts | below the pool cut | **above** the pool cut |

wsCJ's null is a fact about the corpus — three quarters of what looks like
"fifty doors of one programme" is one body's back catalogue, so there is no door
to derive. That fact says nothing about whether a national-vs-EU-wide ordering
term helps a 40-row cut. **Different mechanism, different scope, prior does not
transfer.** This is why the workstream ran.

## 1. What `proximity` actually is, read from the code before it was measured

`proximityFit` (`lib/intelligence/poolBlend.ts`) returns 1 for a fund in one of
the founder's own countries, `EU_WIDE_PROXIMITY = 0.45` for an EU-wide one, and
0 for anything else.

**The third value is unreachable inside a founder's table.** The establishment
screen runs first — `selectInstrumentRows` filters on
`instrumentServesCountry(i.country, founderCountries)` (`shortlist.ts:1569`),
which admits `EU` and the founder's own countries and nothing else. So every row
the blend scores is already one or the other, and inside the pool

> **`proximity` is not a geography signal. It is a BINARY NATIONAL-vs-EU-WIDE
> PRIOR**, and the blend's largest fitted weight (4.062) is on that one bit.

The one path that reaches the 0 branch is the empty-channel fallback
(`if (!candidates.length && !NATIONAL_CHANNELS.has(channel)) candidates = offered`),
which is rare and applies to no national channel by construction.

## 2. The product is NOT blind to country, and the home-above-EU rule has been measured before

The brief's premise — `rowRelevance` is `wTheme·theme + (1−wTheme)·sectorFit`
and has no home-country term — is true of `rowRelevance`. It is not true of the
product. `selectLeafInstruments` sorts each channel's leaves with a country tier
ABOVE theme and above ticket fit (`shortlist.ts:1680`):

```ts
const isExactCountry = (i: DbInstrument) =>
  founderCountries.length > 0 &&
  (founderCountries.some((c) => toIso2(c) === i.country) || i.country === "EU");
```

Note what that predicate treats as one class. The comment above it records why,
and it is the precedent this workstream has to answer:

> This tested `toIso2(c) === i.country`, and an EU-wide instrument carries
> country "EU", which never equals "IT". So every national scheme outranked
> every EU programme, and the leaf cap cut before Horizon was reached. Measured
> on 80 real recipients replayed through the pipeline: **the fund a company
> ACTUALLY won was missing from the pool 25% of the time**, and the misses were
> overwhelmingly Horizon clusters, EIC and Joint Undertakings — the programmes
> that fund the most companies in Europe.

So a home-above-EU-wide ordering is not an untried lever. It is a rule this
codebase shipped, measured at a 25-point reachability cost, and reverted to
parity — *"only the pan-European tier is promoted, and only to parity, never
above home"*. A proximity weight of 4.062 over a binary column is that rule
returning as a soft one.

**That is a mechanism-level prediction, made before the numbers:** the blend's
proximity term should help EXACT@5 for the founders whose won fund is national
(most of them, because the answer key is built from national registers) and hurt
POOL REACH for the founders whose won fund is pan-European — and the pool cut is
exactly the stage where reach is priced.

## 3. What is being measured

`cd website/frontend && npm run stages` — n=897, holdout, the one population,
free, one arm per process because `POOL_BLEND` is read at module scope.

Reproduce:

```
bash project-mgmt/findings/proximity_wsGX/run.sh off on pure
bash project-mgmt/findings/proximity_wsGX/run_recall.sh off on

BASE=.../trace_off.jsonl ARM=.../trace_on.jsonl STAGE=pool_cut \
  npx tsx scripts/_wsgx_pairs.ts
```

Two instruments were extended to make this answerable at all, and both changes
are in this branch:

- `measure_funnel.ts` now prints `row_order=<arm>` on the levers line and a
  `██ NOT THE SHIPPED ORDER` banner in `latest.md` when the arm is not `off`.
  Until now an arm run and a baseline run wrote byte-comparable headers and
  differed only in the numbers — the same shape that let four figures on four
  populations be read against each other.
- `FUNNEL_TRACE=<path outside the repo>` dumps one line per founder, so two runs
  can be PAIRED. `latest.json` is aggregate only, which made "is the gain spread
  or is it one market" unanswerable without re-implementing the ladder in a
  scratch script. The dump is refused anywhere inside the working tree: a
  regime is a `parentId`, and for a standalone fund that IS the won fund's id.
