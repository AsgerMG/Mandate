# The fifteen points are not lost anywhere. They were never a pool problem.

**Workstream CI · 2026-08-09 · isolated worktree off `main` at `a5903573`.**

Reproduce (FREE — one Voyage embed and one Postgres read per pair, no model
calls):

```
cd website/frontend
SPLIT=tune    N=250 npx tsx scripts/_wsci_autopsy.ts
SPLIT=holdout N=250 npx tsx scripts/_wsci_autopsy.ts
SPLIT=tune    N=250 OUT=/tmp/a.json npx tsx scripts/_wsci_autopsy.ts   # + the pool dump

# the clean region A/B: one draw, one difference
POP=region_known REGION=off    SPLIT=tune N=250 npx tsx scripts/_wsci_autopsy.ts
POP=region_known REGION=strict SPLIT=tune N=250 npx tsx scripts/_wsci_autopsy.ts
```

---

## 1. The four buckets

Every miss classified by WHERE it was lost, on 250 pairs of each split, same
sampler and same seed as `measure_recall.ts`. Bucket 4 is wsCA's ceiling
complement computed per pair: the won leaf's residual class under the six
fields that already rank, on `_wsca_marginal.ts`'s key verbatim.

| bucket | holdout | % of loss | tune | % of loss |
|---|--:|--:|--:|--:|
| 1 **never in the pool** — a screen or a gate | 7 | 3.7% | 1 | 0.5% |
| 2 **cut before the table** — leaf cap / collapse / dedupe | 14 | 7.4% | 8 | 4.4% |
| 3 **ranked below five** — on the table, lost on score | 78 | **41.5%** | 73 | **39.9%** |
| 4 **unwinnable** — residual class > 5 | 89 | **47.3%** | 101 | **55.2%** |
| | 188 | | 183 | |

EXACT@5 **24.8%** holdout, 26.8% tune. The distribution reproduces across the
split, which is the only reason it is worth acting on.

**Worked example, each.**

1. `eib_venture`, founder in SE. The whole `eib` channel never reached the
   table: it is a `LARGE_SCALE_TOPUP` lane that opens only on a €15M+ ticket
   and the replayed founder asks for €500k–2.5M. **The exclusion is correct.**
   What is not correct is that *nothing recorded it* — see §4.
2. `satr_de_rnd__sa_56245__finanzamt_darmstadt`, founder in DE. `SEL-CAPITAL`:
   the instrument is a `tax_credit` and the founder asked for grants and loans.
   **The exclusion is correct.** All 14 holdout and all 8 tune misses in this
   bucket are the same shape — a tax credit or an equity vehicle offered to
   someone who asked for neither. Bucket 2 is not a defect, it is the answer
   key replaying a founder whose stated preference excludes the fund they won.
3. `innovationsfonden_innofounder__innofounder_089d34`, founder in DK, rank 15
   of 29 candidates. A genuine ranking miss with nothing else wrong.
4. `ademe_aid__realisation_d_installations_de_production_de_cha_ae31cf`,
   founder in FR, **residual class 58**. Fifty-eight leaves of one scheme that
   no answer to any of the six intake questions tells apart.

**So the actionable loss is bucket 3 and nothing else.** Buckets 1 and 2
together are 11.1% of the holdout loss and every case examined is the product
behaving correctly.

---

## 2. Where the points actually are: 77.6% right programme, 26.8% right door

The buckets say *where*. These three numbers say *what*, and they are the
finding (tune, N=250):

```
the won leaf is IN THE POOL                       96.4%
its NOTIFIED SCHEME reaches the published five    77.6%
the exact LEAF reaches the published five         26.8%
```

Retrieval is not the problem and the pool is not the problem. **We choose the
right programme three times in four and the right door once in four**, out of a
median of **53 candidate siblings** for the won leaf's own scheme. The ranker is
better than chance at it — the won door is the scheme's top-ranked candidate
11.8% of the time against 5.1% for a uniform draw, and in the scheme's top five
39.3% against 19.9% — but 2.3× chance over 53 doors does not put one row on a
five-row page.

Bucket 4 *is* this fact seen from the corpus side. `ademe_aid` at class 58,
`bdns_es_ayudas`, `satr_*`: a notified scheme delivered through dozens of
regional bodies, and no founder-answerable property separates them. wsCA already
proved no question closes it and wsCG2 already proved no row shape closes it.

---

## 3. Four families of change, measured, all ≤ 0

The published five are literally `pool[0..4]` — `computeVerdict` slices the
candidate array and nothing reorders it — so `OUT=` dumps the ordering and any
rule that only permutes or filters it can be scored exactly, for free. On the
tune draw (base 67/250):

| rule | EXACT@5 | delta | gained / lost |
|---|--:|--:|---|
| base (shipped order) | 26.8% | — | — |
| max 1 leaf per REGIME in the five | 19.6% | **−7.2** | +6 / −24 |
| max 2 per regime | 21.2% | −5.6 | +3 / −17 |
| max 3 per regime | 24.4% | −2.4 | +2 / −8 |
| max 4 per regime | 26.0% | −0.8 | +0 / −2 |
| max 1..3 per DOOR (`doorKey`) | 26.8% | **0.0** | +0 / −0 |
| regime-grouped (best scheme first, then its leaves) | 18.8% | **−8.0** | +5 / −25 |
| door-grouped | 26.8% | 0.0 | +0 / −0 |

**Every diversity rule is strictly harmful and every door rule is exactly
inert.** Showing a founder several doors of one scheme is what earns the hits we
have: 36 of 67 hits have two or more siblings of the won scheme among the five.
Spreading the five across distinct programmes trades those away for less than a
quarter as many gains. The door rules reproduce wsCG2's zero from a different
direction — the leaf already is the door, so a door key changes no ordering.

The regime-level headroom of any permutation whatever is 83.2%: that is how
often the won scheme is among the top five DISTINCT schemes in the pool. The
`max 1 per regime` row above is what cashing all of it costs — the page then
holds five distinct programmes and the wrong door in each.

---

## 4. Two real defects the autopsy found, neither worth a point

**A fund removed with its whole channel leaves no record.** `rules.ts` opens
"every removal reports here". The channel loop only iterates
`DEFAULT_INSTRUMENTS`, so a channel outside those five that is never surfaced by
peers or the thematic top-up is dropped with no `ExclusionLog` event at all —
7 of the 188 holdout misses (`horizon_eu_partnership` ×4, `eib`, `innovation_fund`,
`edf`). The autopsy reports them as `NO-EVENT/channel-absent` rather than
guessing, which is why the bucket is honest, but the register's own claim is
false and a founder asking "why is Horizon not here" cannot be answered.

**The sibling re-rank enforces a different invariant from the one it
documents.** The block at `byChannel` in `shortlist.ts` says regime-level
composition is unchanged by construction. It is not: the group is the CHANNEL,
and `state_aid_satr` holds dozens of notified schemes, so a leaf of one scheme
can be handed a score slot another scheme's leaf earned. Only channel-level
composition was ever preserved.

Scoping it to the scheme is one line, and is shipped behind
`SIBLING_SCOPE=regime`, **default off**:

| population | channel (today) | regime | paired flips |
|---|--:|--:|---|
| default replay, region unanswered | 26.8% | **26.8%** | 0 — bit-identical |
| region answered (`POP=region_known REGION=strict`) | 22.8% | 24.0% | +13 / −9, net **+4 of 22** |

Bit-identical on the default population for a mechanical reason: `obj` and `awd`
return one value for every leaf of a scheme, so the group falls through the
`every(pref === pref[0])` guard. On the region-answering population it is +1.2
points, net 4 on 22 discordant pairs, p≈0.5 — **inside the noise, not a
result**. Gains spread over six regimes and losses over four, so it is at least
not one programme. It stays off.

---

## 5. The one lever that moved: region, and it is already shipped

Same draw, same rows, same seed, one difference:

```
POP=region_known REGION=off      EXACT@5  47/250  18.8%
POP=region_known REGION=strict   EXACT@5  57/250  22.8%    +4.0
```

and the signature is exactly right: bucket 3 falls 77 → 68 while bucket 4 holds
at 115 → 114, and "a sibling of the won leaf is on the published five" falls
51 → 40. Region acts on the DOOR choice inside the right scheme, which §2 says
is the whole residual.

**This is not a change to ship — it is already live.** `panel.tsx` asks region
and pre-fills it from the registered address. The consequence is a measurement
one, and it is worth stating plainly: **the headline EXACT@5 this project steers
by is measured with region withheld, on a product that pre-fills it.** Every
comparison of "25% shipped" against a ceiling has been made against the arm
where the founder declined to answer the single most decisive question.

---

## 6. The build gate is nondeterministic, and it was not saying so

Found while verifying that §4's flag was inert. `check_recall_floor.ts`, the
gate that fails the build, was run twice **on the same commit, the same seed and
the same corpus**:

```
regime5  87%  (floor 88)  FAILED   <- run shared the machine with a 250-pair harness
regime5  96%  (floor 88)  ok       <- run alone
```

Same 136-row slice. `semanticFundMatch` has a 3s connect and a 3s statement
timeout and returns an **empty map** on any failure, and every `rankerUsed` call
site tests `semantic.size` — so under load a run silently ranks some pairs on
embeddings and some on the lexical fallback, averages the two, and prints one
number. `requireLiveCorpus` and `requireCredentials` are both satisfied
throughout: they catch a run where the WHOLE thing took the fallback, and this
is the case where PART of it did.

Fixed by counting it. `semantic.ts` now tallies requests per ranker
(`resetRankerTally` / `rankerTally` / `rankerTallyLine`), and both the autopsy
and the floor check print it beside the verdict:

```
  ranker: all 297 request(s) on EMBEDDING                       <- clean
  ranker: 0/5 on EMBEDDING, 5 FELL BACK TO LEXICAL -- this run
  averages two different systems and the number is not
  comparable with a clean one. LEXICAL — ... NOT the system a
  founder is served by.                                          <- forced, and proved
```

A request with nothing long enough to embed is deliberately **not** counted as a
fallback: it never asked the embedding ranker for anything, and counting it
would make the line shout on every profile-mode replay, which is how a warning
stops being read.

It reports and does not decide. Making it a failure condition would put a new
red light in `npm run check` in the same commit that discovered the phenomenon,
before anyone knows how often it fires on a quiet machine — and a gate nobody
can predict is the gate that gets scrolled past. That is the follow-up, not
this.

**Read every recall number in this repo with this in mind.** Any figure measured
on a loaded machine before today may be an average of two ranking systems, and
nothing on screen said which.

---

## 7. What this means for what the product promises

The honest reading, and it changes the promise rather than the roadmap.

**The fifteen points are mostly unwinnable, and the actionable remainder is
ranking, which is closed.** 47.3% of the holdout loss is a residual class larger
than five rows. Another 41.5% is a ranking miss on a median pool of 90, against
which wsBU found no signal outside its half-width and §3 finds no permutation
that is not negative. The screen-and-cut buckets that this workstream existed to
find are 11.1% of the loss and are, case by case, the product being right.

What the product reliably does is name **the right programme, 77.6% of the
time**. What it cannot do is name **which of a scheme's fifty-odd delivering
bodies is yours**, because the registers do not publish a property that
separates them and no founder can state one. A memo that promises five specific
funds is promising the half of that we do not have. A memo that names the scheme,
says plainly that the delivering body follows from where the founder is
registered, and gives the next step against the scheme, is promising the half we
do — and it is the same page.

**Do not re-propose**, now measured here rather than argued: per-regime or
per-door diversity in the five (§3), a door-level row (§3, and wsCG2), and any
plan that treats the pool or the screen as the binding constraint (§1).

---

## What was changed

- `website/frontend/scripts/_wsci_autopsy.ts` — the autopsy. Replays
  `measure_recall.ts`'s own pairs through the same `computeVerdict` with the
  funnel's `ExclusionLog` attached, classifies every miss into the four buckets,
  reports mechanism and winnability as a CROSS TAB rather than a priority chain
  so the precedence is visible, prints regime concentration beside every bucket,
  and dumps the candidate ordering under `OUT=` so a permutation rule costs
  nothing to score.
- `website/frontend/scripts/_wsci_chan.ts` — the channel-absence read behind §4.
- `website/frontend/lib/intelligence/shortlist.ts` — `SIBLING_SCOPE`, default
  `channel`, so nothing a founder sees changes.
- `website/frontend/lib/intelligence/semantic.ts` — the ranker tally behind §6.
  Records, never decides.
- `website/frontend/scripts/check_recall_floor.ts` — prints the tally beside the
  verdict. No floor added, removed, raised or lowered.

`npx tsc --noEmit` clean. `check_comparator_admits.ts` PASS.
`check_recall_floor.ts` **ok**, all floors met, `ranker: all 297 request(s) on
EMBEDDING` — recorded beside this file as `gap_autopsy_wsCI_floor.txt`. No floor
touched, no floor lowered.

**Guards proved to fail rather than assumed green**, each by running it:

- `residualClassSizes` throws rather than measuring nothing when no publishable
  instrument matches the corpus.
- An unknown `REGION=` or `POP=` value throws rather than being read as "off".
- The `SIBLING_SCOPE` flag was verified to REACH the module
  (`SIBLING_SCOPE=regime npx tsx -e 'import {SIBLING_SCOPE} ...'` → `regime`)
  before either arm was believed. A flag that silently does not arrive reports
  "no effect" for both arms, which is the shape of every false null in this
  project's history — and here the regime arm really was bit-identical on one
  population, so without this the run would have been indistinguishable from a
  flag that never arrived.
- The §6 ranker guard was made to fire on purpose (`VOYAGE_KEY=deliberately-invalid`
  → `0/5 on EMBEDDING, 5 FELL BACK TO LEXICAL`) rather than left green and
  assumed working.
