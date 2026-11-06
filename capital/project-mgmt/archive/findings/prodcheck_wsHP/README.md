# wsHP — what one real founder actually got from the live deployment

**Run 2026-08-18, `npm run prodcheck`, one founder, `https://euro-inv-tracker.vercel.app`.
One brief. Actual spend: one production brief (~EUR 0.25) against a EUR 3 cap.**

Full terminal output: `run_2026-08-18.txt` in this directory. The memo is
reproduced below so it can be read without running anything.

---

## Why this run existed

`scripts/measure_funnel.ts` — the instrument this project has optimised for two
weeks — contains **no reference to `/api/intelligence`, to `runIntelligence` or
to any route**. It imports the pipeline and calls it, and so does every other
harness here. The number we move is measured in a process that is not the one a
founder's request runs in, on a machine that is not the one that serves them,
against whatever corpus that process happened to hydrate.

`scripts/prodcheck.ts` closes that for ONE company. It is a **LOOK** — does this
work for one person, right now — and it may never print a percentage or drive a
second company; `assertOneFounder` ends the run on a list. The heavy run stays
the verification.

It does not own a copy of the founder's path. `lib/intelligence/__founderPath.ts`
holds the four calls, their order, each payload and the id handoff, and
`founderPath.test.ts` fails when that disagrees with `panel.tsx`. This run
supplied a **transport** — `fetch` at the deployment instead of the handler
modules in-process — and nothing else.

## The founder

**A.M.L. MICROTECHNIQUE LORRAINE** (FR, semiconductors & electronics), from the
897 held-out described founders `measure_funnel` draws. Chosen because the score
**misses** her: on the 40-founder trace her own fund ranks 112th of 112 on the
instrument table, so this is a look at what a founder gets when we are wrong —
the case nobody had ever looked at in production. She is also the one founder in
that draw whose won fund is one of the 22 rows wsHN renamed.

She really won `satr_fr_rnd__sa_40391__ministere_de_l_economie_et_des_finances`
— *Régime cadre exempté ... (RDI) pour la période 2014-2023*, **SA.40391**.

---

## 1. THE CORPUS PRODUCTION ACTUALLY USED — `postgres`

```
source       POSTGRES
instruments  1088
observedAt   2026-08-18T18:23:02.091Z
degraded     no
```

**This was unobservable until this run.** `hydrateDbInstruments` degrades to the
committed snapshot on any Postgres failure, silently and by design, and every
harness hydrates its own — so nothing in the tree could say which store the
DEPLOYMENT ranks on. `/api/intelligence/verdict` now serves
`corpusProvenance()` beside the verdict, safe unauthenticated by the same
argument as `/api/guards`: a store name, a count and two timestamps, naming no
fund and no founder.

The answer is the good one. The 63 gate corrections are reaching founders.

## 2. THE FUND SHE WON — absent

```
pool         row 99 of 118    (by instrument id — exact)
first screen ABSENT from the six instant rows
published    ABSENT from the seven published rows
```

**But the answer key names a scheme that ended on 2020-12-30.** SA.40391's
`scheme_end_date` is `2020-12-30`, basis `notified_duration` — the Commission's
own notified duration. This founder can never be a hit in a brief that is honest
about what is open, and she is nonetheless in the funnel's denominator marked
`offerable=true`. **The successor she was offered instead is a sibling, not the
successor**: production published SA.111728 (*aides en faveur des PME*
2024-2026, same ministry), while SA.40391's actual RDI successor is SA.111723.

## 3. AN EXPIRED SCHEME WAS PUBLISHED AS A DOOR — the worst thing here

Published **row 5** is *Régime cadre exempté ... PME pour la période 2014-2020*,
**SA.40453**, `scheme_end_date = 2020-12-30`, basis `notified_duration`. Its next
step reads:

> Contact Conseil régional Occitanie directly to confirm this regime is still
> accepting applications.

A regime whose notified duration ended five years and eight months ago was put in
front of a founder as one of seven doors, with a link, a typical award of
EUR 980,817 and an instruction to go and ask. The only hedge the founder gets is
the writer's own `stale` line — *"recorded no award since 2022, so it may be
dormant rather than closed"* — which is about awards, not about the fact on
record that the scheme ENDED.

Scale, measured on the same live corpus the run used:

```
publishable instruments                                        778
... carrying a notified end date already in the past           130
```

**One publishable fund in six carries an end date behind us**, and nothing in the
row, the verdict, the money line or `betweenCalls` says so. `betweenCalls` is the
mechanism for exactly this shape and it did not fire.

## 4. wsHN REACHED PRODUCTION, AND A RAW INSTRUMENT ID CAME BACK THROUGH IT

Published rows 4 and 6 render as:

```
Régime cadre exempté de notification relatif aux aides en faveur des PME pour la
période 2024-2026 · rnd  sa 111728  ministere de l economie et des finances ·
via Conseil régional
```

No row is *titled* as a ministry — wsHN holds at the head of the label. But
`distinguishRowNames` (`lib/intelligence/shortlist.ts`, the id-slug fallback)
prints the internal instrument id as human text when the peer group's bodies are
ministries and `nameableBody` refuses them. The comment two branches above that
line already says the id fragment "is an internal slug and tells a reader
nothing", and the comment above `named` already anticipates the ministry case.
So the ministry name wsHN took out of the title walks straight back in as a slug,
and the founder reads `rnd  sa 111728  ministere de l economie et des finances`
in the middle of a fund's name. Two of seven rows.

## 5. THE MEMO NAMES A FUND THAT IS NOT IN THE TABLE

Bottom-line bullet 3 gives the founder a fund, a verdict and a blocker:

> PACTE Industrie is open to you on paper, but ADEME's incentive-effect rule
> requires the aid application to precede the start of work ...

**There is no PACTE Industrie row.** The writer saw a candidate menu larger than
the published cap and wrote about a row that was then cut. A founder reading the
bullets and then the table cannot find the fund they were just advised about.

## 6. WHAT HELD

- **The ladder.** Seven rows published, and **all seven links returned 200** —
  one `apply`, two `scheme`, four `programme`.
- **wsHM.** The ask and the award are labelled as different quantities. No
  "matching your ask" anywhere in the memo; the money line is
  `Typical award EUR 449,356 · 705 awards · ticket ... · intensity 45%`, and the
  ask is never restated as an award.
- **wsHL.** The founder's sector reached the writer and is visibly used:
  *"Horizon EU CL4's own record leans toward semiconductors and electronics,
  which matches the materials and process work you do"*. The round-two answers
  reached it too — the ADEME incentive-effect bullet is written off *"you told us
  work has already started"*.
- **wsHO.** No truncation. One `report` event, 5,162 characters of model-written
  prose, memo ends on a closed sentence, 0 error events.
- **The whole path**, end to end: 206.9s wall clock; region 1.8s, verdict 7.3s,
  intake 26.1s, memo the balance.

## 7. A ROW CANNOT BE IDENTIFIED

`InstitutionEntry` carries `institution`, `channel` and `schemeCode` — and **no
instrument id**. So nothing downstream of the writer can say which fund a
published row is: not an adviser, not a founder, not a harness. `prodcheck`'s
first cut matched the answer key against the table by name with containment and
reported "published row 4" — the won fund's name sat inside a DIFFERENT notified
scheme's rendered label, two regimes and six years apart. That is the 322-share-
143-names trap arriving through a fuzzy comparison. The containment branch is
removed; the id-based pool rank is the number to trust. **The underlying gap is
in the product, not in this script.**

---

## THE MEMO, AS THE FOUNDER RECEIVED IT

### Bottom line

- You have one traced public award, €1.0M in state aid from development banks in
  2021. No comparable companies in your sub-sector are traced in the database, so
  there is no peer pattern to benchmark against.
- Bpifrance inov is the right first move: it is a national grant and soft-loan
  line open to French SMEs, with no documented rule closing you out.
- PACTE Industrie is open to you on paper, but ADEME's incentive-effect rule
  requires the aid application to precede the start of work, and you told us work
  has already started on this project. That closes this route for the current
  phase of work unless you scope a new, not-yet-started phase.
- The three French state aid regime rows (via Conseil régional, Conseil régional
  Grand Est) sit alongside Bpifrance as national doors: each is a separate legal
  route with its own typical award, worth checking in parallel rather than
  choosing just one.
- A national R&D grant under these regimes is non-dilutive money you keep in
  full, unlike the EIC's blended option which takes an equity stake through the
  EIC Fund.

### Positioning

Frame this project against the industrial-modernisation priority the French state
and regions just reinforced: Bpifrance and the regions launched a fifth,
regionalised axis of France 2030 in July 2026 dedicated to helping industrial SMEs
adopt advanced manufacturing technologies, alongside the existing innovation axis,
a fit for a company adding a new surface-treatment step to additive manufacturing's
value chain. Bpifrance and the regional authorities behind your state-aid rows
score projects on innovation and regional industrial impact rather than on a rubric
of public purpose or market excellence alone, so the case to make is that this
deposition technology extends what French industrial equipment and materials
suppliers can already produce, not a pitch about end users you do not sell to.
Horizon EU CL4's own record leans toward semiconductors and electronics, which
matches the materials and process work you do, and is worth citing as fit if you
build a consortium. Keep the frame on the technology's place in the
additive-manufacturing supply chain and the equipment makers and materials
suppliers who would adopt it, since that is the only commercial relationship you
have described.

### State of play

Horizon EU CL4 sits inside a live redesign: the Commission's July 2025 proposal for
a €234 billion European Competitiveness Fund would fold Horizon Europe's Pillar II
into four new windows from 2028, with a €51.5 billion digital-leadership window and
a €125.2 billion resilience-and-industry window covering territory close to your
work. The scope and allocation of those windows are still being negotiated with the
Council and Parliament as of July 2026, so a CL4 proposal built on today's call
topics may need reframing once the new windows are set. EIC Accelerator has also
just opened a distinct €100M defence-focused call in June 2026, separate from its
standard Accelerator track, a sign the programme is segmenting by strategic
priority rather than holding one uniform call. Neither of these changes your
eligibility today, but both mean the argument that wins a Horizon or EIC
application in 2026 may not be the argument that wins after 2028.

### Caveats

Figures shown are committed amounts drawn from public registers on each
instrument's own reporting basis, database coverage varies by country and scheme,
and absence from this database never means a company received no public funding.

### The seven rows

| # | row | money | verdict | link |
|---|---|---|---|---|
| 1 | Bpifrance · inov (FR) | Typical award EUR 449,356 · 705 awards · intensity 45% | open, 8 filters | 200 apply |
| 2 | EIC Accelerator (EU) | Typical award EUR 2,496,599 · 626 awards | unknown, 0 filters | 200 programme |
| 3 | Horizon EU CL4 (EU) | Typical award EUR 381,500 · 10,666 awards | open, 6 filters | 200 programme |
| 4 | Régime cadre ... PME 2024-2026 · `rnd  sa 111728  ministere de l economie et des finances` · via Conseil régional (FR) | Typical award EUR 999,327 · 52 awards | open, 9 filters | 200 scheme SA.111728 |
| 5 | Régime cadre ... PME 2014-2020 · via Conseil régional Occitanie (FR) — **ENDED 2020-12-30** | Typical award EUR 980,817 · 91 awards | open, 7 filters | 200 scheme SA.40453 |
| 6 | Régime cadre ... PME 2024-2026 · `rnd  sa 111728  region grand est` (FR) | Typical award EUR 170,000 · 73 awards | open, 9 filters | 200 scheme SA.111728 |
| 7 | Horizon EU CL5 (EU) | Typical award EUR 338,794 · 11,224 awards | open, 6 filters | 200 programme |

Row-by-row prose, the eligibility screen and the timings are in
`run_2026-08-18.txt`.

---

## WHAT TO DO, IN ORDER OF WHAT A FOUNDER LOSES

1. **An expired notified scheme may not be published as a door.** 130 of 778
   publishable instruments carry an end date already in the past, and one of them
   was row 5 of this brief with "confirm this regime is still accepting
   applications" under it. Either suppress, or state the expiry on the row the
   way `betweenCalls` states a shut window.
2. **The id-slug fallback in `distinguishRowNames` may not print an internal
   id.** It is the last branch before `schemeCode`, and the branch order can be
   changed without changing what separates the peers.
3. **The writer may not name a fund the table does not carry.** The candidate
   menu is wider than the published cap and the prose is written before the cut.
4. **`InstitutionEntry` should carry the instrument id.** Not for the founder —
   for everything downstream that currently has to guess by name.

## Reproduce

```
npm run prodcheck                                  # the founder above
COMPANY="ARBOAIR AB" npm run prodcheck             # any held-out described founder
PRODCHECK_URL=http://localhost:3000 npm run prodcheck
```

One brief per run, on the deployment's own quota. The cost line
(`[cost] brief cost EUR ...`) is logged by the deployment and deliberately not
served to the client: per-request unit economics on a public unauthenticated
endpoint is a disclosure, and the route boundary is not the place to fix it.
Read it with `vercel logs <deployment>` while a run is in flight.

---

## RUN 2 — 2026-08-18 19:35, after wsHR merged. Two fixes confirmed, two new defects.

Same founder, same deployment, `source POSTGRES / 1088 / observedAt 19:35:06Z`.

**Confirmed live, and this is what "seen in production" is for:**

- `row names   ok — none of 7 reveals an instrument id`. wsHR's fix is in front
  of founders. Rows 4-7 now read as real scheme titles with real qualifiers —
  `· via Conseil régional Occitanie`, `· via REGION GRAND EST`, `· Grants ·
  via Conseil régional` — where run 1 printed
  `· rnd  sa 111728  ministere de l economie et des finances ·`.
- All 7 links resolve 200.

**Still broken, and now visibly so — this is wsHQ's:**

Published row 4 is `SA.40453`, and its own title says what it is:

> *Régime cadre exempté de notification relatif aux aides en faveur des PME
> pour **la période 2014-2020*** · via Conseil régional Occitanie

Offered as `open (7 encoded filters evaluated)`, EUR 980,817 typical award, live
link. **The row now honestly announces that its period ended six years ago and
we publish it anyway.**

**NEW — the memo prints a raw internal identifier to the founder.** Bottom line,
bullet 2, verbatim:

> *"Start with the Grand Est regional scheme
> (`satr_fr_rnd__sa_111728__region_grand_est`): it is delivered by REGION GRAND
> EST, which is your own region…"*

wsHR removed the id from the row NAMES. The writer puts it back in its own
prose, in the first thing a founder reads. Nothing offline sees this: the rows
are clean and the guard that checks them passes.

**NEW — `prodcheck`'s bullet matcher gives a false negative.** It annotated that
same bullet `[names no row on the table]`, and the bullet contains row 6's exact
instrument id. It matches on display name only. wsHR fixed the published-rank
matcher for exactly this class and the bullet matcher was left on the old basis —
**so the instrument that reads production has the same defect twice, once fixed
and once not.**

---

## RUN 3 — 2026-08-18 19:47, after wsHQ merged and Vercel redeployed. Both fixes live.

Same founder, same deployment, `source POSTGRES / 1088 / observedAt 19:47:17Z`.

**The 2020 scheme is gone from a real founder's memo.** `SA.40453` — *"pour la
période 2014-2020"*, published as row 4 an hour ago with a live link and a
EUR 980,817 typical award — **appears nowhere.** Every published row now carries
a live window: five say *période 2024-2026*, one is Horizon, one is EIC.

**And the row names stayed clean**, so wsHR held across wsHQ's merge.

**One consequence worth stating rather than burying.** Her won fund,
`satr_fr_rnd__sa_40391`, moved from *pool row 96 of 118* to **ABSENT FROM THE
POOL** — because it too ended 2020-12-30. That is correct: we no longer count a
dead scheme as reachable. It is also the sharper version of wsHQ's finding —
**nine founders in the answer key won a scheme that has since ended**, so part
of the target we grade ourselves against is unreachable by construction, and
was inflating `publishable` rather than measuring the product.

Three runs, EUR 0.75 total. Every defect above was invisible to a green offline
suite.
