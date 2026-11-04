# WS-BB2 — the standalone rows are not a selection defect, they are the answer key

**Date** 2026-08-09 · **Branch** `wsBB2-standalone` · finishes `wsBB-standalone-selection`, follows WS-AW

## The answer in one line

**Reading (2), and not narrowly.** The rows WS-AW flagged are not "funds that
can never be the right answer". They are CDTI, Innovate UK, Bpifrance and
Innovationsfonden — 21,632 awards on record between the eighteen leaves a
founder is actually shown — and the recall set names almost none of them. The
lever is the answer key. Selection is not defective, and the fix WS-BB was
building had, when measured, no effect on any founder's table.

## Why the branch could not be merged, which turned out to matter

`wsBB-standalone-selection`'s last commit added `sectorNeutral.test.ts`,
importing `FALLBACK_UNKNOWN`, `hasSectorHistory` and `sectorFitScorer` from
`./fit` — and simultaneously reverted `fit.ts`, `pipeline.ts` and `shortlist.ts`
back to main. `git diff <merge-base> c0d5cf08` on those three files is **empty**.

So the agent did not die before writing the code. It died after accidentally
deleting code it had already written and measured, leaving the test orphaned.
Everything on the branch was sound; one revert was not. That is the whole
reason it failed typecheck, and it is why the diagnosis below survived intact.

## What WS-BB found, and it was real

`sectorFit` is the one ranking term on the founder's table that is **added**
rather than multiplied:

    fit = wTheme · theme + (1 − wTheme) · sectorFit(mix, founderSector)

Its no-data value was the constant `0.5`, under a docstring calling that
neutral. Addition has no constant identity, so for an added term the neutral
value is whatever the population scores — an empirical quantity. Measured:
the leaves that DO carry history score mean 0.256, median 0.084. **0.5 sat at
the 79th percentile.** Every fund we held no funding history for was scored
above four fifths of the funds we did, on the one component built entirely from
funding history. A promotion granted for an absence.

That diagnosis is correct and the constant is indefensible. What it is *not* is
the thing WS-AW was looking at.

## The guard WS-BB left behind fired on its first honest run

`check_missing_data_neutral.ts` was written to fail if the mean stopped being a
defensible stand-in, and said in its own docstring that the answer would then be
to re-make the mean-versus-median choice rather than widen the band. It fired:

    space             mean stand-in 0.020  →  91st percentile of 673 leaves
    defense_security  mean stand-in 0.029  →  88th

**That is the original defect at one tenth the size.** Where nine leaves in ten
have never funded anything in a sector, the handful of specialists drag the mean
above the entire mode.

The statistic is now the **median**. The property the test states names RANK,
and the median is rank-preserving by construction; the mean is score-preserving,
and on a population this skewed score-preserving *is* rank-promoting.

A median of zero does not **bury** the unknown, which was the objection that put
`0.5` there in the first place. **Ties**: it scores what the 91% score, so the
term takes the same value for all of them and drops out of the comparison
exactly as a multiplier's 1 does. That is neutrality reached for an added term.

    arm       percentile of the stand-in, 11 sectors     guard
    median    44 – 50                                    ok
    mean      51 – 91                                    FAIL (space, defense)
    constant  0.5 everywhere, up to the 99th             FAIL

The band is now **asymmetric (0.20–0.60)**, because the two failures are not:
above the middle is the defect that has shipped twice; below it is mostly the
tie artifact.

## The measurement that settles the fork

### The blind rows never reached the table under any arm

200 holdout founders replayed through `computeVerdict`, counting leaves with no
sector history in the candidate pool and in the five rows shown:

    arm        pool blind%    ES pool blind%    top-5 blind%    ES top-5 blind%
    constant      24.5%           71.3%            0.0%             0.0%
    mean          24.5%           71.3%            0.0%             0.0%
    median        24.4%           71.1%            0.0%             0.0%

**Lift x0.00.** The 88 zero-award BDNS convocatorias are three quarters of a
Spanish founder's candidate pool and **zero per cent of their table**, before
the change and after it. They crowd out nothing. The scoring promotion WS-BB
diagnosed is real and has no reach: something downstream already suppresses
every one of these rows.

### So what *is* the third of the Spanish table that WS-AW measured?

WS-AW's 32.7% reproduces exactly (35.7% here at n=115). It is **standalone**,
which is a much larger set than **blind** — 289 leaves against 94 — and WS-AW's
conclusion conflated them. Naming the leaves separates them in one glance;
no percentage can. ES holdout, `COUNTRY=ES`, n=115:

    instrument              shown   awards   can the key name it?
    cdti_idi                   71     1027   NO
    cdti_misiones              33      540   NO
    cdti_cervera               32       88   NO
    cdti_lic                   27       22   NO
    cdti_neotec                23      576   NO
    cdti_perte_aerosalud       19       59   NO

**Six leaves, 2,312 awards, 100% of the standalone row-slots — and CDTI is
Spain's national innovation agency.** Neotec is the canonical Spanish deep-tech
grant. These are not funds that can never be the right answer for a Spanish
founder; they are the funds that most obviously *are*, and the recall set has
never once named them.

Corpus-wide the same section returns the same shape in five more markets:

    innovate_uk                        17,012 awards   never an answer
    bpifrance_inov                        753          never an answer
    innovationsfonden_erhvervsforsker     676          never an answer
    bpifrance_innovup_leader_idf          144          never an answer
    eis_ettev_tete_digip_rde_toe          193          never an answer

**17 of the 18 standalone leaves a founder is actually shown carry 21,632
awards between them and are never an answer anywhere in the active set.** One
Danish leaf reads `yes`, which is what shows the accessor is not vacuously
false.

For those rows EXACT@5 is not measuring retrieval. It is reporting the coverage
of the key, and it will report the same number however selection is changed.

## Recall, three seeds, and the point is that it is flat

`SPLIT=holdout N=300 ANSWERS=real`, seeds 20260806 / 7 / 99. Raw counts.

    arm        seed 20260806   seed 7      seed 99     EXACT@5   REGIME@5   pool
               pool/e5/r5      pool/e5/r5  pool/e5/r5  /900      /900       /900
    constant   289/90/258      292/88/249  293/94/251  272       758        874
    median     289/91/258      292/88/249  293/93/251  272       758        874

**Bit-identical in aggregate.** Spain with power, `COUNTRY=ES`, n=115 (±8.8pp):

    arm        in pool        EXACT@5      REGIME@5
    constant   102/115 (89%)  42 (37%)     86 (75%)
    median     102/115 (89%)  41 (36%)     87 (76%)

One pair each way.

Re-verified after merging `main` (which brought a new corpus snapshot), so the
claim is about the corpus that ships and not the one the runs started on:

    arm        ALL n=300                    ES n=115
    constant   pool 289 / e5 88 / r5 255    102 / 37 / 87
    median     pool 289 / e5 88 / r5 255    102 / 36 / 88

Corpus-wide **identical to the pair**; Spain one each way.

This is **not a disappointing result** — it is the predicted
one, and predicting it is what licensed the change. The cross-tabulation is
exact: **0 of 88 zero-award leaves are ever an answer, against 278 of 694 that
carry awards** (`scripts/probe_standalone_pool.ts`). The key cannot reward or
punish how these rows are ranked. Recall's job here was to prove no harm, and
it does.

`check_recall_floor` on the branch: pool 98 (floor 93), exact5 27 (22),
regime5 84 (80), original join 86 (70). `traced:exact_attribution` 82 against a
floor of 84 — **red on `main` identically**, caused by the corpus snapshot
merged into main on 2026-08-09, not by this branch. Branch is one point better
than main on `original join`.

## What ships

1. **`sectorFitScorer` in `fit.ts`**, solving the missing-data score over the
   caller's own pool as the median. Read by `selectLeafInstruments`,
   `materialiseInstrumentTable` and `scoreFit`. `sectorFit` now returns `null`
   when it cannot tell, so no caller can take a constant by accident — the type
   change is what found all five call sites.
2. **`SECTOR_NEUTRAL_ARM=constant|mean|median`**, the three-arm measurement
   switch, read once at module load. Unset — every request the product serves —
   is `median`. `constant` reproduces `main` to the pair, which is how the
   baseline above was taken without a second checkout.
3. **`lib/intelligence/sectorNeutral.test.ts`** — the property as twelve
   hand-built cases, including `MOVES WITH THE POPULATION` (which any literal
   fails) and the `SKEW CASE` (which the mean fails).
4. **`scripts/check_missing_data_neutral.ts`** — the same property against the
   live corpus, wired into `run_checks.mjs`. Verified to pass on median and fail
   on both other arms.
5. **`scripts/measure_evidence_reach.ts`** — the instrument the answer key
   cannot be, now including the **roster** section above. The roster is the part
   that settles the reading, and it cost nothing to add.
6. **`scripts/probe_standalone_pool.ts`** — the cross-tabulation, free, and the
   question to ask *before* paying to encode a register.
7. **`check_hydration_parity.ts`** says *which* difference it found instead of
   guessing. Both of its old guesses — "(gate order)", "(framework citations?)"
   — were wrong the first time they fired.

Nothing is hardcoded. "Blind" is `sectorMix` empty or absent, the input
`sectorFit` reads; "standalone" is `regimeSize(parentId ?? id) < 2`. No country,
fund or scheme code appears in any of it.

## What should happen next, and it is not a ranking change

**The finding is a data finding, and it belongs to the answer key.** The recall
set cannot name the national innovation agency of Spain, the UK, France,
Estonia or Denmark. Every number this repo publishes about EXACT@5 is computed
against a key with that hole in it, and the hole is not random — it is exactly
the standalone, register-derived leaves that five of our sixteen concentrated
markets consist of.

Two consequences worth stating plainly:

- **Do not tune selection against this.** WS-AW already declined to, on weaker
  evidence, and was right. Any change that suppresses standalone leaves will
  look free on EXACT@5 and will be removing CDTI Neotec from a Spanish
  founder's table.
- **The prize from fixing the key is larger than the prize from fixing the
  ranker.** 36% of publishable leaves are standalone and the key can grade
  almost none of them. Until it can, "EXACT@5 30%" is a statement about 278
  nameable instruments, not about the 782 the product offers.

The honest negative, restated from WS-AW because it is still true and was still
paid for twice: **encoding eligibility rules for a parent-less fund buys the
ranker nothing today.** It buys the eligibility screen, which is a real product
surface. It is not a reason to expect recall to move.
