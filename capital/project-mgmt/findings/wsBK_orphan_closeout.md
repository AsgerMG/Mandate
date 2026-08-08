# Workstream BK — closing the orphan register

*2026-08-08. Worked from `wsBF_orphan_audit.md`'s "Sequenced, not attempted"
list, on `main` at `f1f4157c`, in a worktree.*

BF found 28 orphans in five shapes, fixed 10 and sequenced 9. Items 1, 2 and 4
belong to workstream BH (applicant identity, the 954 unembedded gates,
`nuts_regions.json`) and item 9 to BJ (lint); this closes **3, 5, 6 and most of
8**, and leaves 7 open with the reason on the record.

The one structural guard is `ETL/schema/check_artifact_reachability.py`. It is
the data-layer twin of BF's `check_guard_reachability.py`: that one asks whether
every guard runs somewhere, this one asks whether every artifact those guards
and the product read can be rebuilt and is watched by something.

---

## The finding that was not in the register

BF's item #14 said the four ranking artifacts had no regeneration and no
staleness guard. Both true. But the reason it matters is one layer down and
nobody had looked:

**All four were read at request time behind a bare `catch { cache = {} }`.**

```ts
try  { peerPriorCache = JSON.parse(readFileSync(...)) }
catch { peerPriorCache = {} }        // shortlist.ts:1820
```

This is the same defect BF fixed in `corpus.ts` on the same day — where a bare
catch turned "not where I looked" into "the corpus is empty" and two guards
printed a confident green over 0 instruments — except on the path a real founder
goes down, and four times over. An empty object here is not a degraded ranker,
it is a **different** ranker:

| artifact | what the neutral value does |
|---|---|
| `peerPrior` | peer precedence OFF; exact-scheme recall 43% → 24% |
| `regionPrior` | every fund reads as having no regional footprint |
| `__objectives` | the registered-purpose re-rank OFF for all 421 schemes |
| `channelPrior` | the EU-over-national composition bias, restored |

Every one of them fails to the shape of "this signal happens to be uninformative
today", which is indistinguishable from working. And this is precisely the path
BF listed as unauditable: `next.config.ts` file tracing decides which non-source
files sit beside the serverless function on Vercel, none of these is
force-traced, and a tracing miss produces exactly this — a deployed ranker
missing its strongest signal, with a green build and no log line.

**Fixed:** one loader, `lib/intelligence/generatedArtifact.ts`. Still a fallback
and never a throw — at request time a degraded ranking beats a 500 — but the
failure is now *said* (file, cwd, error, and what the ranking loses) and
*recorded*, so a harness can refuse to publish a figure taken from a run whose
ranker was half switched off. Proved by moving the file:

```
generatedArtifact: could not read peerPrior.generated.json at .../peerPrior.generated.json
(cwd .../website/frontend): ENOENT... Falling back to the neutral value — peer
precedence is OFF; exact-scheme recall falls from about 43% to 24%. Any ranking
figure from this process is about that, NOT about the corpus.
```

Before this change the same removal printed nothing at all.

---

## The structural guard

`ETL/schema/check_artifact_reachability.py`, in CI's `etl` job, credential-free,
committed source only. For every committed artifact under
`website/frontend/lib/intelligence/`, derived per file rather than listed:

1. **PRODUCER** — something binds a path to this filename and writes that path.
2. **REGENERATION** — that producer is named by a rebuild path.
3. **STALENESS** — some `check_*` module names it, so a copy that has fallen
   behind the corpus is somebody's problem.
4. **ONE LOADER** — no production module under `lib/` reads it directly.

Four things that make it a guard rather than a gesture:

- **A mention is not a write.** The first version credited `emit_peer_prior.py`
  as the producer of all five recall sets, because it names them (it excludes
  their companies from the prior) and separately writes a file. That is a false
  green in a check whose whole job is to find things nothing produces — it would
  have reported the recall sets rebuildable by a script that has never written
  one. The rule now ties the write to the name.
- **A check is never a producer.** Without that, the guard reads its own
  docstring — which quotes both a write call and an artifact name while
  explaining the rule — and credits itself as the producer of `themeIndex`.
- **Comment lines do not count**, for BF's reason: `refresh.py` now explains at
  length which artifacts it rebuilds, and counting prose would mean the better
  the explanation, the greener the check.
- **The escape hatch expires.** Eight artifacts are declared in
  `manual_artifacts` with a reason and a review date. Same clock, same argument
  as BF's `manual` block.

**Why `refresh.py` counts here when `npm run check` does not count there.** Not
a softer rule, a different question. A guard's value is in running when nobody
chose to; an artifact's value is in being *rebuildable* — one documented command
re-derives it, so a stale copy is one command from correct. The two are
complementary: property 3 can only be satisfied by a `check_*` module, which
`check_guard_reachability` then forces onto a real path.

**Provoked red four ways** before being left green: an expired review date; a
producer dropped off the rebuild path; a reader given its own `readFileSync`
back; and the artifact directory pointed somewhere else (which hits the
emptiness floor rather than printing "ok — 0 artifacts", the failure BF recorded
twice on 2026-08-08).

### The eight honest declarations

| artifact | waives | why |
|---|---|---|
| the five `__recallSet*.json` | producer / regeneration | a **pinned holdout**. Its value is that it does not move: auto-regenerating would re-cut the ground truth under the floors and make one run's number incomparable with the last. Staleness *is* watched — `check_recall_floor` reports ABSENT pairs every run, through the one loader `scripts/recallSet.ts`. |
| `evidenceTiers.json` | producer | hand-written, and the one place the cited/attributable/inadmissible contract is defined for both languages. It has no producer because it is a **decision, not a derivation**. |
| `offerRouteRatchet.generated.json` | regeneration | a **ratchet baseline**. Regenerating it automatically would raise the ceiling to whatever today's corpus is and disarm the guard on the same run that broke it. |
| `semanticCache.generated.json` | loader | `semantic.ts` is reached from a `"use client"` boundary and must `require("fs")`; the leaf loader imports `fs` at the top level. The **silence is not waived** — that catch now names the file, the cwd and what is lost. |

---

## What was closed

### #5, #6, #11, #14 — regeneration and staleness

`refresh.py` gained six steps, after the embeds because the leak index is cut
from `instrument_profiles`: peer prior, region prior, channel prior, instrument
objectives, profile leak index, semantic cache. The last two are the ones whose
fix instructions `check_corpus_currency.ts` had been *printing* while nothing
ran them, and the leak index is the one CI's `check_recall_leaks` asserts
against — a leak guard reading a file nothing refreshed.

`check_corpus_currency.ts` gained section 3b: every instrument id named by
`peerPrior`, `regionPrior` and `__objectives` must exist in the live corpus,
each with an emptiness floor. Measured against Postgres the moment it was
written:

```
peerPrior.generated.json names 16 instrument(s) of 699 that the corpus no
longer contains  (innovate_uk__responsive_strategy_and_planning_a8e28f, ...)
```

The 16 cost no rank directly — an id with no row never matches — and that is
exactly why it is worth checking rather than trusting. The artifact was provably
built against a different corpus, and the direction that *does* cost, funds
published since which the peer signal cannot see at all, leaves no trace to
find. An id that is gone is the only observable end of a symmetric drift.

Regenerated all four from the current corpus. `regionPrior` and `__objectives`
came back byte-identical; `peerPrior` and `channelPrior` moved. Floors re-read
out of Postgres, before → after:

| | before | after | floor |
|---|---|---|---|
| pool | 97% | 97% | 93 |
| EXACT@5 | 30% | 28% | 22 |
| REGIME@5 | 86% | 90% | 80 |

EXACT@5 −2 and REGIME@5 +4 on 300 pairs, both inside the ±2.6pp binomial noise
of that sample. The fresh artifact is the truthful one; no floor was touched.

### #22, #25 — one guard policy, not two

`refresh.py` and `railway_cron.py` held **opposite** answers to the same two
questions, and the census exists precisely so `check_corpus_census.ts` cannot
tell a local run from the weekly one. While they disagreed, it could.

`railway_cron.py` had the better argument written down already and it wins on
both. `refresh.py` now: a failing **guard** is recorded and loud but does not
stop the chain; the **census** is written last, whatever happened, carrying the
real outcome instead of a hard-coded `ok`.

The cost of the old policy was measurable rather than theoretical. Step 13
(`check_hydration_parity`) is red on main, so steps 14–23 had not been running —
including the two embed steps that clear the 954 unembedded gates, the guard
that *reports* the 954, and the census itself. **A guard failing had been
silently cancelling the fix for the thing it was complaining about.**

Two things deliberately unchanged:

- `coverage_gate.py` stays fatal. It is not a guard, it is a **publish gate** —
  it runs before the export and the publish and exists to stop a worse corpus
  shipping. Continuing past it would ship the regression.
- Every build step stays fatal. Half a refresh is worse than none.

One thing added: after a guard-red run the source hashes are **not** recorded,
so the next `refresh.py` re-examines this corpus instead of reporting "no source
changed" and doing nothing.

### #13, #24 — the "keep in sync" comment that was the bug

`stop_gate.py` carried a copy of `build_site_data.py`'s `GENERATED` list under a
comment saying to keep them in sync. They disagreed in three places:

- it named `companies/manifest.json`, which exists nowhere in the repo, so the
  hook reported one MISSING file unconditionally whenever `db.sqlite` was
  present — a warning that is always on, which is a warning nobody reads;
- it lacked `taxonomy.json` and `companies_index.json`, so two files that *do*
  go stale were the two it could never report.

A hook crying wolf about a phantom while staying quiet about two real files is
worse than no hook. It now imports the builder's own dict, and an import failure
is reported rather than swallowed — silently checking nothing is the defect
being fixed.

### #27 and its family — documented paths that do not exist

`manifest.py` documented its SATR loader as `ETL/load/load_satr.py`; the file is
at `ETL/events/load/`. Sweeping for the same shape found the ETL block reorg had
left ~30 more across live code and the two READMEs — `ETL/load/`,
`ETL/transform/`, `ETL/extract/` prefixes that no longer exist. All repaired,
each resolved to a unique existing file.

Deliberately **not** repaired in `project-mgmt/`: those documents record what was
true when they were written, and the sweep's first pass "fixed"
`wsBF_orphan_audit.md`'s citation of the wrong path — destroying the finding.

### Item 8 — the dead modules

Deleted `_wsat_dump.py`, `_wsat_measure.py`, `_wsau_facets.py`, `_wsau_probe.py`
— underscore-prefixed one-shot workstream probes, referenced by nothing.

**Kept `splink_dedupe.py`**, against BF's item 8. It is a self-described proof of
concept for Layer 2 of the data-hygiene merge, which is *parked*, not dead.
Deleting it would discard a parked decision, and BF itself said which of the 89
human-only modules are correctly dead needs product intent.

---

## Deferred, with reasons

- **#23, reconcile the two publish paths.** Seven divergences between
  `refresh.py` and `make eligibility`, whose own comment calls it "THE SECOND
  PATH TO PRODUCTION". Each divergence is a product decision about what ships,
  not a mechanical merge, and getting one wrong publishes a corpus nobody chose.
  The census/guard policy above was the half of this that had a written argument
  to settle it; this half does not.
- **The two dead columns** (`companies.company_group`,
  `funding_instruments.override_name`). Dropping a column needs a migration, and
  migrations plus schema replay are workstream BE's, deliberately not
  re-audited here. `override_name` is not even in `schema.sql` — the string
  occurs in exactly one file, its writer.

## Still not auditable, and still worth saying

Everything BF could not audit remains unaudited, for the same reasons: whether
Railway is deployed with `railway_cron.py` (needs credentials), whether Next's
file tracing breaks the two runtime `readFileSync` reads on Vercel (needs a real
deployed build), dead writes reached via `SELECT *` (a lower bound), and which
of the 89 human-only modules are correctly dead.

The Vercel one is now at least *legible* if it happens: the four ranking reads
that would have failed silently there now print what they lost.

## New, and not on anybody's list

**`check_env_loader` is red on pristine `main`.** Confirmed against the
un-modified checkout, not this worktree — exit 1, several diagnostic harnesses
reading `VOYAGE_KEY` through `corpus.ts` without declaring it. The brief's
known-red set names four guards; this is a fifth. It is only visible at all
because BF stopped `npm run check` short-circuiting, which is the point of that
fix and also its bill.
