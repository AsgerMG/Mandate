# Workstream AD — the stale ranking artifact, and the floors that could not be raised

Branch `workstream-ad-cache-floors`, off `main` at `5903a6e3`. Every figure below
came out of Postgres with `requireLiveCorpus` asserting it; every run printed its
own corpus and timestamp. Corpus **1,084 instruments** throughout,
2026-08-07 17:22–18:00 UTC.

**Two headlines.**

1. The regeneration was needed and it bought something real — but **not** what
   the brief expected. It did not move recall by a single pair, and it could not
   have. It fixed the *offline* suite, which had been disagreeing with the
   shipping system on 2 of 12 archetypes.
2. **The floors cannot be raised.** Re-derived properly on three clean seeds:
   pool and REGIME@5 are unmoved on the pinned sample, EXACT@5 has *fallen* two
   points, and the proposed 83 for REGIME@5 would have failed on seed 7 today.
   Nothing lowered, nothing raised.

And one thing found on the way that matters more than either: **a second
artifact was stale, and that one is a guard.**

---

## 1. The premise "it feeds ranking" is false, and it is worth knowing why

`semanticCache.generated.json` was 70 instruments behind — 1,014 scored against
1,084 live, 86 funds absent, 16 scored that no longer exist, and 83% of the
shared ids at a different rank (max 0.55 of the percentile range). All true.

But it is read from exactly one place, `semantic.ts:204`, inside the
`if (!process.env.DATABASE_URL)` branch. Every recall harness asserts
`requireLiveCorpus`, which means every recall harness has `DATABASE_URL`, which
means none of them ever reach that line. Proved three ways rather than argued:

- **Instrumented.** A `console.error` on the branch itself, one credentialed
  `measure_recall` run: **0 hits.**
- **Before/after, three seeds, N=300.** Byte-identical on every metric and every
  stratum — mode, population, regime size, founder country. Not "within noise":
  identical, 900 replays per side.
- The gate agrees: `check_recall_floor` reads 98 / 30 / 87 before and after.

So no recall figure recorded today was measured against stale scores. The
figures were always live.

### What the staleness actually cost: the offline suite ranked a dead corpus

The consumers are the runs with **no** credentials — vitest (196 tests, no env
loading at all), `red_team`, and `check_archetypes` as CI runs it. Those *were*
ranking on the 2026-08-06 index. Measured by running the archetypes twice, once
credentialed and once with no `.env.local` at all:

| archetype | CI-shaped, stale cache | credentialed (live) | CI-shaped, regenerated |
|---|---|---|---|
| Robotics | 105 / 99 / 96 | **103 / 98 / 94** | **103 / 98 / 94** |
| AI B2C software | 128 / 39 / 118 | **119 / 35 / 109** | **119 / 35 / 109** |

(pool / verdicted / reachable). The other ten agreed throughout. After
regeneration the CI-shaped run matches the credentialed run **row for row**,
including the statuses histogram. The red team moved too: the Portugal
idea-stage case reordered its five rows (IHI 2nd → 5th, Horizon EIE 5th → 2nd).

That is the award-median defect in miniature — a check validating a ranking the
product does not ship — and it was live for a day.

### The builder is genuinely reading the live corpus

The documented echo defect (no `.env.local`, so `semanticFundMatch` reads this
very artifact and writes it back reporting success) is closed, and was already
closed by a guard in `build()`. Verified independently anyway, by a script that
shares **no code** with `semantic.ts`: re-embed through Voyage, rank
`instrument_profiles` in Postgres, compare percentile ranks.

| | before regeneration | after |
|---|---|---|
| coverage | 1,014 of 1,084, 16 orphans | **all 18 descriptions × exactly 1,084** |
| rank-position mismatches | 786–848 of 998 | **0 / 0 / 854** on three probes |
| max abs delta | 0.227 – 0.552 | **0.000000 / 0.000000 / 0.012** |

Two of three probed descriptions reproduce **bit-exactly** through a completely
separate path. The third differs by at most 0.012 of the percentile range (~13
of 1,084 places), which is Voyage returning a marginally different embedding for
the same text — worth knowing, and far below anything the ranker acts on. An
echo would have reproduced the *old* file, which is what the "before" column is.

### The latent half of that defect, now closed

The guard checked that the credentials *exist*. It did not check that the run
*used* them. `semanticFundMatch` returns an **empty map** on any failure — dead
key, statement timeout, index mid-rebuild — and the loop did `if (!m.size)
continue`. So a run with an expired Voyage key wrote `{}`, printed
`0 descriptions`, and exited 0: the echo defect wearing different clothes.

`emit_semantic_cache.ts` now asserts `requireLiveCorpus`, prints its corpus, and
refuses to write unless **every** description scores **every** instrument the
live index holds — with the expected id set read independently of the call that
produces the scores, because an emitter must not grade its own output.

---

## 2. The other artifact cut from the same index, and it is a guard

`profileLeakIndex.generated.json` was **also** 70 profiles behind: 1,014
instruments, built 2026-08-06T20:56Z, against 1,084 live.

This is the more dangerous of the two. `check_recall_leaks` tests all 1,155
described rows of the recall set against it, to catch a description sitting
verbatim inside the profile of the fund it is meant to find — the defect that
covered 46% of the old set's holdout `project` rows and inflated every number
taken from them. A guard holding 1,014 of 1,084 profiles **reports green over
the other 70**.

Rebuilt from Postgres: 1,084 profiles, 1.74 MB, **222** squash probes — five new
non-ASCII characters had entered the corpus since 2026-08-06 and were unprobed,
which is the cross-language normaliser contract running one reload behind.

**Re-run on the fresh index: 0 leaks at exact / 8-gram / sibling.** So the
staleness had not yet let one through, and no recall figure needs withdrawing.
It was an unguarded window, not a realised loss.

### Both are now gated

`check_corpus_currency` gains its third property, in the same shape as the two
it already has: **a derived artifact must answer for exactly the corpus that
ships**. Compared on the **id set** — not a count, which matches by coincidence
the moment one fund is added and another withdrawn, and not an mtime, which says
when a file was written rather than what is in it.

Verified by pointing it back at the stale artifacts: it fires, names the counts,
and prints the rebuild command. Skips without `DATABASE_URL`, so CI is unchanged.

---

## 3. A gate that was silently not running

`check_recall_floor` is the last step of `npm run check`. On no credentials it
prints `SKIPPED` and **exits 0**.

Its `.env.local` preamble read only `./.env.local`. That file is gitignored, so
in any fresh worktree it is absent — while the repo-root one, where
`DATABASE_URL` is documented to live, is right there. `npm run check` therefore
reported a green build **with the recall floors never evaluated**, on a machine
that had the credentials all along.

The block had been pasted into **40 harnesses**; seven had learned to read both
paths and thirty-three had not, and three separate comments in the repo record
three separate agents rediscovering it. It is now one function,
`scripts/loadEnv.ts`, with the ambient environment beating both files so CI and
Vercel are unaffected. Converted: `check_recall_floor`, `measure_recall`,
`emit_semantic_cache`, `check_corpus_currency`. Verified by running
`check_recall_floor` with credentials at the repo root and none under
`website/frontend`: it now reaches `corpus=postgres instruments=1084` where it
used to print `SKIPPED`. The skip message also now names the files it looked in,
because "no credentials" and "credentials in the other file" had looked identical.

**Thirty-six harnesses still carry a private copy.** They are measurement
scripts, not build gates, so the failure mode is a number quietly taken off the
lexical fallback rather than a green build — but it is the same defect and it is
the obvious next sweep.

---

## 4. The floors, re-derived

Three seeds, tune split, N=300, Postgres asserted, corpus 1,084 throughout.
Measured twice — before and after the regeneration — and **byte-identical both
times**, so one table serves for both.

| | **pinned** 20260806 | seed 7 | seed 99 | lowest |
|---|---|---|---|---|
| pool | **98** (293/300) | 96 (289) | 96 (289) | 96 |
| EXACT@5 | **30** (91/300) | 31 (94) | 28 (84) | 28 |
| REGIME@5 | **87** (262/300) | 82 (246) | 83 (248) | 82 |
| REGIME@5 original join | **83** (n=151) | 76 (n=160) | 77 (n=151) | 76 |
| REGIME@5 traced | **91** (n=149) | 89 (n=140) | 89 (n=149) | 89 |

Against the block these replace — pinned 98 / 32 / 87, orig 85, traced 90:

- pool **unmoved** (98)
- REGIME@5 **unmoved** (87)
- EXACT@5 **down two** (32 → 30)
- original join **down two** (85 → 83)
- traced **up one** (90 → 91)

**Nothing rose. So there is nothing to raise a floor onto.**

### Applying the margin the file has always used

The file states its own convention, and it is not arbitrary: SEED and N are
pinned, so sampling noise inside the margin is zero. The margin buys one thing —
room for the corpus and the index to move — and it is widest where the
measurement has been *seen* to move.

| | convention | applied to today | in force | verdict |
|---|---|---|---|---|
| pool | 5 under pinned, 3 under lowest seed | 93, 93 | **93** | exactly right |
| EXACT@5 | 10 under pinned | 20 | **22** | already tighter; held, never lowered |
| REGIME@5 | 7 under pinned | 80 | **80** | exactly right |
| original join | wider than headline | — | **70** | 6 under lowest seed |
| traced | wider than headline | — | **84** | 5 under lowest seed |

### Why 95 / 25 / 83 is not supportable

Not caution — arithmetic:

- **pool 95** is 3 under pinned and **one** under the lowest seed. The stated
  margin is 5 and 3.
- **EXACT@5 25** is 5 under pinned, half the stated margin, on the metric this
  same file records swinging **20 → 32 across a single index rebuild**. A
  twelve-point observed move against a five-point margin.
- **REGIME@5 83** is **above** the lowest seed. It would have **failed on seed 7
  today** (82). A floor a legitimate reseed fails is precisely what the existing
  comment refused to create when it declined to raise 80 to 82.

The two population floors are set against an **eight-point** move this same
pinned sample was seen to make across one corpus state (traced 98 → 90).
Raising either takes the margin below the one figure they exist to absorb.

### The number to watch

**EXACT@5 is now the tightest thing in the file** — 8 points of margin where it
specifies 10 — and it got there by the measurement falling, not by the floor
rising. It is also the metric with the largest observed excursion in this
repo's history. If a future session wants a raise anywhere, EXACT@5 is where the
*headroom* question should be asked, and the answer today is that there is less
of it than the file claims.

---

## 5. Two smaller things, recorded not fixed

**A one-pair transient.** Two identical N=60 runs 48 seconds apart differed by
one pair (EXACT@5 16 vs 17, in DE); four other runs of that exact configuration
over the following six minutes all agreed with each other and with the majority
reading. `semanticFundMatch` has a 6 s timeout and returns an empty map on
expiry, which silently degrades that one pair to lexical ranking. So a recall run
carries roughly ±1 pair in 60 of network noise that no confidence interval
accounts for, and it is invisible. Worth a retry, or at minimum a count of
empty-map returns printed with the result.

**Where "1,092" came from.** `check_theme_index` reported its size as
`lines - 3`, which read **1,092** against a corpus of 1,084 — eight entries
wrap. That eight-too-high figure had already been quoted into a brief as the
size of the index. Fixed to count keys with the same regex the check's own
staleness diff uses; it now reports 1,084. The check itself was always
byte-exact, so nothing it guards was ever wrong — only what it said about
itself.

**`check_archetypes` grades a different system on CI than on a laptop.** It
loads `.env.local` and, unlike `red_team` and `measure_recall`, has no
`if (NO_PG) delete DATABASE_URL`. So `NO_PG=1 npm run check` on a credentialed
machine runs it live while CI runs it on the cache. That is exactly the
divergence the semantic cache exists to close, and it is why the 2-of-12
archetype gap above needed a deliberately un-credentialed run to see at all.

---

## 6. `check_hydration_parity` was already red on `main`, and this halves it

Running the suite step by step past the census failure surfaced a third
pre-existing red. `check_hydration_parity` runs the 12 archetypes down the
Postgres path and the JSON path and diffs the answers — it is the only check
that can see the two stores disagreeing, and it has already earned its place
three times.

| | differences |
|---|---|
| with the stale cache (i.e. what `main` has) | **7**, one of them a membership difference — Robotics returned 9 instruments (`sns_ju`, `ihi`, `euspa`, `sesar_ju`, `clean_aviation`, `chp`, `eurohpc`, `gh_edctp3`, `europes_rail`) on the JSON path that the Postgres path did not |
| with the regenerated cache | **2**, both order-only, deterministic across three runs |

Nobody had seen it, because `check_corpus_census` fails earlier in the `&&`
chain and `npm run check` never reaches it.

The residual two, diagnosed but **not fixed** — they belong to phase-one gate
hydration, not to this workstream:

- **Robotics**: the same 103 ids in a different order, first divergence at
  position 1 (`satr_de_rnd__sa_118705__tuv_rheinland…` ranks 2nd on the JSON
  path and 27th on Postgres). A founder gets the same funds in a different order
  depending on which store answered.
- **AI B2C software**: one Spanish instrument
  (`bdns_es_ayudas__…_convocator_4c4a7c`) publishes two eligibility criteria on
  the JSON path and **none** on the Postgres path. That is a gate the shipping
  path does not hydrate.

The second is the one to chase: an empty criteria list is not a cosmetic
difference, it is a row published without the rules it was screened on.

---

## 7. State on exit

Run, not assumed:

- **`check_recall_floor`** — ok. 98 / 30 / 87, populations 83 and 91, all floors
  met, `corpus=postgres instruments=1084`.
- **`check_corpus_currency`** — ok, including both new properties.
- **`check_recall_leaks`** — ok, 1,155 rows, 0 leaks, 222 probes.
- `check_leaf_cap`, `check_payload_budget`, `check_client_boundary`,
  `check_dependencies` — ok. `check_extracted_quotes` skips (no raw docs).
- `npx tsc --noEmit`, `npx vitest run` (196 tests) — ok.
- **`npm run check` exits 1**, at `check_corpus_census`, and everything above was
  therefore run individually. The census failure is pre-existing and not this
  workstream's: census #4 (17:51Z) records the scheduled ETL failing at
  `refresh_open_calls.py` with `coverage: no such column: tier`, plus the
  code-fingerprint DRIFT the brief anticipated. Untouched.
- **`check_hydration_parity` exits 1** at 2 differences — pre-existing at 7, see
  §6.

Corpus reads, taken close together and recorded: 1,084 instruments and 1,084
embedded profiles at 17:22, 17:25, 17:40 and 17:44 UTC; snapshot generated
17:04 UTC; every recall run printed 1,084 in its own header.
