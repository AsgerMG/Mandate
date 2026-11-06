# The door is not a fact about the address, and the oracle bound is zero.

**Workstream CJ · 2026-08-09 · isolated worktree off `main` at `e7f06813`.**

Reproduce (FREE — one Voyage embed per pair and two Postgres reads, no model
calls, nothing written):

```
cd website/frontend
SPLIT=tune    N=250 OUT=/tmp/wscj/tune.json    npx tsx scripts/_wsci_autopsy.ts
SPLIT=holdout N=250 OUT=/tmp/wscj/holdout.json npx tsx scripts/_wsci_autopsy.ts

DUMP=/tmp/wscj/tune.json                    npx tsx scripts/_wscj_territory.ts
DUMP=/tmp/wscj/tune.json SPLIT=tune N=250   npx tsx scripts/_wscj_screen.ts
```

Both replays printed `ranker: all 247 request(s) on EMBEDDING`, recorded beside
this file. Base EXACT@5 reproduced wsCI exactly: **26.8% tune, 24.0% holdout**.

---

## The proposal, and the premise it rests on

The autopsy left the product naming the right notified scheme 77.6% of the time
and the right leaf 26.8%, out of a median 53 siblings. The proposal was that the
remainder is not a prediction: a founder does not *rank* into a door, they are
*assigned* one by where they are registered. Ask for the address in the first
gate, and the door becomes a lookup.

That is a good idea and it has one factual premise, which is false.

> **PREMISE.** Two sibling leaves differ by the BODY that delivers them, and
> those bodies have territories.

## The test, stated as a property

For any two publishable leaves under one parent, exactly one of:

| | | evidence | can an address choose? |
|---|---|---|---|
| **T** | territorial | share a `scheme_code`, name **different** administering bodies | **yes** |
| **C** | catalogue | share a body (or have none) and differ by call | no — the call picks the body, not the reverse |
| **S** | scheme-level | sole door of its own notified scheme | no; a catchment *screen* could act, but that is not a door |

The test names no fund, no country and no sector. It reads two columns every
instrument has, so an instrument loaded tomorrow is classified without editing
anything.

**A blank `scheme_code` is the ABSENCE of a notification, not a join key.** That
one line is the difference between a +36-point bound and a zero one, and it is
where this workstream would have gone wrong: treating `""` as shared identity
fuses 87 Spanish *convocatorias* and 75 ADEME calls into a single "door".

## 1. The corpus is not territorial

```
instruments 1088, of which in a multi-leaf family 780
  T  territorial   76   7.0%
  C  catalogue    295  27.1%
  S  scheme-level 717  65.9%
```

All 76 territorial doors sit in 19 clusters, all under `satr_*`: FR 34, DE 26,
IT 6, IE 4, PT 4, FI 2. The largest is SA.56245 — the German R&D tax credit
delivered through 18 *Finanzämter*.

## 2. THE ORACLE BOUND: +0.4 tune, +0.0 holdout

Assume a **perfect** address→door lookup — every territorial cluster collapses
to the correct door, free of error, at any granularity you like.

| | tune | holdout |
|---|--:|--:|
| base (shipped) | 26.8% | 24.0% |
| **perfect door inside territorial clusters** | **27.2% (+0.4)** | **24.0% (+0.0)** |
| over-credit: fuse blank `scheme_code` too | 62.8% (+36.0) | 56.8% (+32.8) |
| ceiling of any permutation whatever | 80.8% | 75.2% |

**It reproduces across the split, which is the only reason it is worth acting
on.** The entire distance between line 2 and line 3 is catalogue collapse, which
no address question reaches. Only 21 of 250 tune pairs and 22 of 250 holdout
pairs have a won leaf in a territorial cluster at all.

Misses by what separates the won leaf from its siblings, tune / holdout:

```
  94 / 87   51.4% / 45.8%  C catalogue     <- an address cannot act
  38 / 47   20.8% / 24.7%  standalone leaf, no siblings
  31 / 34   16.9% / 17.9%  S scheme-level  <- a screen could act, not a door
  20 / 22   10.9% / 11.6%  T territorial   <- an address could act
```

## 3. And the mechanism does not exist either

Rule Zero says who delivers a fund comes from the official source. Asked of the
76 territorial doors, where the separating territory could come from:

```
  (a) OFFICIALLY STATED   0   0.0%
  (b) INFERABLE from our award footprint, decisively   12  15.8%
  (c) AMBIGUOUS — nothing we hold separates them       64  84.2%
```

**(a) is zero for a structural reason, not a coverage one.** The EC case
register declares a catchment per *notification*, and territorial siblings share
their notification by construction — so the one official source that names a
territory can never separate two doors of one scheme. SA.56245's catchment is
`DE`, for all eighteen tax offices.

The 18-door German cluster spreads over only 13 distinct NUTS-2 footprints, so
**not even NUTS-2 separates it**. A *Finanzamt* remit is written in
municipalities. The answer key carries NUTS-1.

## 4. The guard fires: 15 verified winners would be blocked

Built as `_wscj_screen.ts` §1, the equivalent of `check_winner_not_blocked` for
this derivation, run over the whole answer key rather than a sample. A pair
counts as blocked when the register says the company received that leaf, its
region is known from a *different* scheme's award, and the leaf's official
catchment excludes that region.

```
  pairs with a leak-free region AND an official catchment   582
  VERIFIED WINNERS THE SCREEN WOULD BLOCK                    15   2.6%
```

Named, because a rate hides which ones: **Siemens** (×3), **Siemens Energy
Global**, **H2 MOBILITY Deutschland**, **Mint Hydrogen Germany**, NRW.BANK and
NBank recipients, **Regione Lombardia** recipients ×2, **Finpiemonte**.

The reason is general and it is the deeper finding:

> **A territorial remit attaches to the establishment carrying out the project,
> not to the company's registered seat.** H2 MOBILITY, registered in Bavaria,
> won a scheme delivered by *Bezirksregierung Arnsberg* in North
> Rhine-Westphalia. Asking a founder for their registered address answers a
> different question from the one the body's remit asks, and the register does
> not record the project site.

So the address is not merely low-value here. It is **the wrong key**, and a
derivation built on it removes companies from programmes they have won.

## 5. The screen, bounded too, since it was the honest alternative

A catchment *screen* — remove a separately notified scheme whose own
notification declares a region the founder is not in — is the one address
mechanism Rule Zero fully supports, and it acts on the 17% S bucket.

|  | tune | holdout |
|---|--:|--:|
| base | 26.8% | 24.0% |
| with the official catchment screen | 27.6% (**+0.8**) | 24.4% (**+0.4**) |
| draws where the screen removed the WON leaf | 1 of 29 | 3 of 31 |

Only 141 of 1088 instruments (13.0%) carry a catchment narrower than their
country, so there is almost nothing to screen. It buys under a point and
removes the correct answer roughly as often as it promotes it. **Not shipped.**

---

## What this means

**Six routes have now returned ≈ +0.0** — ranking (wsBU), per-fund evidence
(wsBY), stage-2 questions (wsCE), door-level rows (wsCG2), pool and permutation
rules (wsCI §3), and now the address (here). This one is different from the
others in a way worth stating: it did not fail on measurement noise, it failed
on a **fact about the corpus**. Three quarters of what looks like "fifty-odd
doors of one programme" is a body's own back catalogue of calls. There is no
door to derive.

The autopsy's conclusion stands and this strengthens it: name the **scheme**,
which we get right three times in four, and say plainly that the delivering body
follows from where the work is done.

**Do not re-propose**, now measured rather than argued:

- an address, a postcode or a NUTS3 question in gate 1 or gate 2, for the
  purpose of choosing a door (§2 — the bound is +0.0 on holdout with a perfect
  oracle, so no question can beat it);
- an official-catchment screen on the shortlist (§5 — +0.4 to +0.8, and it
  blocks 15 verified winners);
- any rule that groups instruments on a blank `scheme_code` (§ the property —
  it fuses distinct calls and reads as +36 points that do not exist).

## What was changed

Nothing a founder sees. No intake field, no flag, no floor, no product code.

- `website/frontend/scripts/_wscj_territory.ts` — the T/C/S classification, the
  territorial inventory, the Rule Zero (a)/(b)/(c) split, and the oracle ladder.
  Free: one Postgres read plus an existing wsCI pool dump.
- `website/frontend/scripts/_wscj_screen.ts` — the blocked-winner guard and the
  screen oracle. Asserts row-for-row that its sample is the same draw as the
  dump, rather than assuming two code paths agree.

**Guards proved to fail rather than assumed green.** The blocked-winner guard is
not green: it returns 15 on live data, with the companies named, and that is the
evidence this derivation must not ship. It additionally throws rather than
printing a clean `0/0` when its population is empty, which is the failure mode
that would have made a wrong derivation look safe.
