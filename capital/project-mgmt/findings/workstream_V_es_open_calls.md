# Workstream V — Spain's open calls

Running log, written as findings land.

## The premise, restated so it can be checked

Spain's instruments are built from BDNS *award* records. A regime assembled from
awards can only ever contain calls that have already paid out, so by construction
the corpus holds Spain's past and not its present. Once workstream L-ES2
correctly closed the 80 expired convocatorias, Spain had **13 proposable rows**,
and a Spanish founder asking "which five funds should I apply to" was being
served from a corpus that structurally could not contain a call open today.

## The open-flag is not merely unqueryable — it is wrong

The previous agent found that `abierto=true` on `/convocatorias/busqueda` returns
the same 647,047 rows as no filter at all, and stopped there. Two things were
found on top of that, and together they close the question.

**1. BDNS documents the absence itself.** FAQ 203, shipped inside the portal's
own Angular bundle (`main.*.js`, id `"203"`):

> **¿Cómo puedo saber en qué convocatorias el plazo para presentar solicitudes
> está aún abierto?**
> No hay una manera directa de saberlo, salvo examinar las convocatorias una a
> una. La razón para no poder ofrecer esta información es que, por costumbre en
> España, muchos plazos están condicionados por la fecha de publicación del
> anuncio/extracto de la convocatoria en el diario oficial correspondiente.

So this is not a parameter we failed to find. The register states that no such
parameter exists and gives the reason: a large share of Spanish deadlines are
expressed relative to a publication event rather than as a date.

**2. The flag disagrees with the register's own dates.** codigoBDNS 922483
(MINTUR, hostelería equipment renewal) carries `abierto: false` alongside
`fechaFinSolicitud: 2026-09-30` — the flag says shut while the register's own
dates say the window runs for another two months. Measured across the whole
harvest by `--audit`, not anecdotal.

Openness is therefore **derived** from `fechaFinSolicitud`, per record, and an
undated call is excluded rather than guessed at. That last part is not
fastidiousness: `scheme_end_date` is the only mechanism that removes a row from
what a brief may propose, so a row the corpus cannot date is a row it cannot
later close — the exact defect that left 80 dead Spanish calls proposable.

## What the search endpoint will actually filter on

Probed rather than assumed. Of the parameters the portal's own bundle sends,
these change the result count and these do not:

| parameter | effect on the 2026 slice (43,360 rows) |
|---|---|
| `fechaDesde` / `fechaHasta` | **works** — filters on `fechaRecepcion` |
| `tipoAdministracion` = C / A / L | **works** — 1,104 / 9,010 / 31,544. One value per request; `C&A` returns the C count |
| `tiposBeneficiario` = 1..4 | **works** — 9,568 / 31,522 / 6,036 / 1,549. Comma list `3,4` works and unions (6,125) |
| `instrumentos`, `finalidad`, `regiones` | works |
| `abierto`, `estado`, `soloAbiertas`, `nivel1`, `mrr`, `reglamentos`, `sectores`, `tipoConvocatoria` | accepted and **ignored** |

`tiposBeneficiario` is the load-bearing one. Its four values resolve, via the
detail payload, to the register's own beneficiary vocabulary:

```
1  PERSONAS FÍSICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA
2  PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA
3  PYME Y PERSONAS FÍSICAS QUE DESARROLLAN ACTIVIDAD ECONÓMICA
4  GRAN EMPRESA
```

3 and 4 are exactly "the beneficiary is an undertaking", stated by the register.
That is a server-side filter, so the 647,047-row register is reduced to a
fetchable candidate set before a single detail request is made.

## The inclusion property

Stated as four clauses, each a field the register publishes, none naming a
programme, a body, a sector or a scheme code. `--audit` prices each clause with
a leave-one-out so a clause that stops discriminating is visible rather than
assumed.

- **OPEN** — `fechaFinSolicitud` is a real date and has not passed.
- **UNDERTAKING** — the declared beneficiary classes include an economic one.
- **SCHEME** — `tipoConvocatoria` is concurrencia competitiva, not concesión
  directa. A direct concession names its recipient inside the instrument, so
  proposing one to a founder who is not that recipient wastes their time by
  construction.
- **SUBSTANCE** — a stated budget at or above the floor, and at least three
  register facts that tell the call apart from its neighbours (purpose, sector,
  region, regulatory basis, notified measure — deliberately **not** the
  beneficiary enumeration, which takes 6 distinct values across the existing 87
  leaves and leaves a mean sibling class of 45.3).

### The budget floor is derived from the corpus, not chosen

A hardcoded euro threshold would be exactly the kind of patch this project
bans. The floor is instead read off the corpus's own existing Spanish
inventory — the schemes it already considers worth being a row:

```
existing ES leaves with a stated budget: 84 of 87
  min      300,000        p50   44,619,248
  p10    9,000,000        p90  247,662,125
```

The property is: **a candidate must be at least as substantial as the least
substantial scheme the corpus already publishes for that country.** For ES that
is €300,000, computed rather than typed. It is self-consistent — admitting a
€300k open call while already publishing a €300k closed one is the only
non-contradictory position — and it moves on its own if the corpus's existing
floor moves.

## The overlap gate, run at the grain that can actually collide

The project's HARD RULE is the SATR-overlap gate before any national load. That
gate is written for award events and dedups on beneficiary name + year ± 1 +
amount. **This load adds no award events at all** — it cannot move a euro of
`public_funding_events`, and Postgres does not even hold that table. What it can
duplicate is INSTRUMENTS, so the gate was run on the identity that collides:

- `ayudaEstado` — the notified measure (85 of 87 existing leaves carry one; 64
  distinct SA numbers)
- `descripcionBasesReguladoras` — the standing regulatory instrument. Two
  convocatorias sharing it are two calls of ONE scheme; that is what bases
  reguladoras means. (64 distinct across the existing leaves.)
- `codigoBDNS` — call identity; a collision here is a bug, not a merge.

Result on the first 504 cached details (81 admitted):

```
same call already held (a duplicate)              0
a NEW CALL of a scheme the corpus already holds   6   -> 2 existing leaves revivable
no scheme in the corpus matches                  75
```

**The gate's finding inverts the usual reading.** A match is not something to
drop — it is the best available outcome. An open call matching an existing leaf
is *this year's call of a fund the corpus already holds*, with award history, an
administering body, a sector mix and award percentiles attached. The existing
row is closed only because the corpus recorded a *previous* call's deadline.

But the match rate is low, and that is the load-shaping fact: the overwhelming
majority of Spain's open business calls are schemes the corpus has never
observed paying anything.

## The constraint that decides the load shape

`meetsDataFloor` (website/frontend/lib/intelligence/accessMode.ts) admits an
instrument only if `total_eur > 0` OR `last_year` is set. A convocatoria with no
awards yet has neither, and the two functions the floor protects behave exactly
as its docstring warns:

```
scaleFit    returns 0.5 when typicalAward() is null  (awardP50, else totalEur/eventCount)
livenessFit returns 0.5 when lastYear is null
```

so an evidence-free row scores neutral on both and outranks a fund we measured
and found middling. That rule was adopted on measurement (18 of 724 publishable
instruments; no country lost its last national route) and it is right.

Checked for precedent before arguing with it: **every zero-event instrument in
the corpus today is either a framework/family row or an EU policy-reference row,
and none of them is publishable.** There is no precedent for a proposable
instrument with no observed awards.

Neither missing value can be filled honestly. `presupuestoTotal` is a call's
total budget, not an award size — a €10M call may make five awards or five
hundred — so writing it to `award_p50` would be a fabrication, and writing it to
`total_eur` would state observed awards that were never observed.

---

# The decision, and the result

## Two populations, two treatments

The overlap gate splits the admitted calls in two, and they are not the same
kind of thing:

- **A call under a scheme the corpus already holds** is not a new fund. It is
  that scheme's current call, and the existing leaf is closed only because the
  corpus recorded a *previous* call's deadline. It gets `successor_scheme` /
  `successor_title`, and the corpus's own redirect in
  `publishableInstruments()` republishes the row under the open call's identity
  **with the award history, administering body, sector mix and award
  percentiles still attached**. No new row, no evidence-free twin. Re-running
  the pass retracts a revival whose call has since shut.
- **A call matching nothing** is a new row with no awards at all.

Only 2 of the 84 admitted calls were revivals. That is the load-shaping fact:
Spain's open business calls are overwhelmingly schemes the corpus has never
observed paying anything, so the second population is the whole of the answer,
and the data floor had to be confronted rather than routed around.

## The rule change, and why it is not a loosening

`meetsDataFloor` gains a third disjunct: a register-stated application window,
basis `call_deadline`, that has not passed.

The floor's own reason for existing is that "every scale and liveness
judgement about it is a guess". A window open **today** is the strongest
liveness fact in the corpus — the fund's own declaration, where `lastYear` is a
proxy the corpus infers and which the floor already accepts five years stale.
Rejecting the first while accepting the second is not conservatism, it is
incoherence.

Narrow in three ways, each tested in `lib/intelligence/dataFloor.test.ts`:
`callDeadline` only (never a notified duration); **future** only, so it can
never resurrect anything; and it grants nothing on **scale** — these rows still
take `awardScorer`'s 1.0, the same neutral the corpus already gives the 98
instruments with no award median.

**Blast radius, measured against Postgres before adoption: of the 41
instruments that fail the first two tests, ZERO have a future call deadline.**
The clause admits nothing that already exists and cannot change any other
country's pool.

`presupuestoTotal` was NOT written to `total_eur` or `award_p50`. A budget is
not an observed award, and a €10M call may make five awards or five hundred, so
a per-award figure derived from a budget is a fabrication. Those columns stay
zero and null. There is a test asserting it.

## The numbers, read back out of Postgres

Isolated at one moment with `--without`, so a neighbouring agent's concurrent
write cannot be mistaken for this load's effect
(`scripts/measure_country_offerable.ts`):

```
ES offerable WITHOUT this load    15      (13 + the 2 revivals)
ES offerable WITH it              93      78 new rows + 2 revived
```

**And they are distinguishable — the class got SMALLER, not larger:**

```
the class a Spanish founder is left choosing between
                        without (15 rows)      with (93 rows)
  nothing recorded            15.0                  93.0
  capital_type                10.2                  65.9
  administering_body           3.1                   4.5
  closing date                11.4                   5.5
  eligibility_text             2.3   67% unique      1.6   69% unique
  body + text + date           1.1   87% unique      1.2   83% unique
```

Six times the inventory, and the mean class on the register text **falls 2.3 to
1.6**, because the new rows carry richer register facts than the old ones. On
the combined key it is flat (1.1 -> 1.2, 87% -> 83% uniquely identified). This
is the question the workstream was told to answer honestly and the answer is
that the addition is not noise.

`measure_sibling_coverage.ts` and `measure_sibling_by_country.ts` both report
Spain **unchanged**, and that is correct rather than reassuring: both score only
MULTI-LEAF REGIMES, and these rows are parentless, so neither can see them.
`scripts/measure_country_offerable.ts` was written for that gap — a founder does
not choose within a regime, they choose from everything they will be offered,
and until now a workstream could have added hundreds of indistinguishable rows
without either existing number moving.

## What the audit found that was not expected

```
`abierto` vs the register's own fechaFinSolicitud, over 7,061 records
  dated records                     4,466
  flag agrees with the dates        3,704
  flag says SHUT, window is OPEN      762   <- rows the flag would lose
  flag says OPEN, window has PASSED     0
  no window recorded at all         2,595  (37%)
```

**Every single open call in the register carries `abierto: false`.** The field
is not unreliable, it is uniformly wrong in one direction — 762 losses, zero
false offers. Deriving from the dates is not a workaround for a flaky flag; it
is the only way this data can be read at all.

The leave-one-out prices each clause:

```
  without open            812   (+719)
  without undertaking      93   (+0)
  without scheme          197   (+104)
  without in_scope        275   (+182)
  without substance       131   (+38)
```

`undertaking` adds **nothing** — because `tiposBeneficiario=3,4` already
applied it server-side during enumeration. The clause is kept because it is the
property rather than an artefact of how the candidates were fetched, and the
audit is what makes that visible instead of assumed. Anyone changing the
enumeration filter must re-read this line.

## Two things found that are NOT this workstream's to fix

- **`state_aid_satr` / DE holds 103 publishable leaves against a cap of 90 —
  13 candidates cut before the ranker ever scores them.** Present with and
  without this load, so not ours. `check_leaf_cap.ts` passes only because it
  deliberately reads the committed JSON snapshot for determinism, and the
  snapshot is behind Postgres. This is exactly the silent failure that file
  exists to prevent, arriving through the one door it left open. Whoever owns
  the release build should see it before the next artifact regeneration.
  Spain lands at 87, headroom 3 — the 80 dead convocatorias L-ES2 closed freed
  almost exactly the room these 78 took. The next Spanish load still trips it.

- **The row names are legal citations, not fund names.** "RESOLUCIÓNpor la que
  se abre la convocatoria para la concesión de subvenciones..." is what BDNS
  publishes as `descripcion`, and there is nothing better in the payload. The
  existing 87 leaves have had this problem all along; this load multiplies it
  by six. `eligibility_text` carries the discriminating facts, so the ranking
  is sound and it is the *presentation* that is poor. It is the single largest
  remaining defect in Spanish inventory and it belongs to whoever owns
  `name_from_catalogue.py`.

## Refresh discipline

The layer is one source tag, `bdns_es_convocatorias_abiertas`, so it is one
DELETE away. It is also **perishable by construction**: every row carries a
call deadline, and 42 distinct deadlines run from 2026-08-12 to 2029-12-18, so
the inventory decays daily and `isClosed()` removes each row on its own date.
Re-running `--enumerate` / `--detail` / `--write` refreshes windows and text in
place (ON CONFLICT) and retracts revivals whose calls have shut.

**This is the first source in the corpus that goes stale on a schedule rather
than on a release.** Nothing currently re-runs it. A monthly re-harvest is the
minimum that keeps the claim honest, and without one Spain drifts back toward
13 as the windows pass — correctly, but silently.
