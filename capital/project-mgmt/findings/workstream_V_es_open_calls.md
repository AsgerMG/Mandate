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
