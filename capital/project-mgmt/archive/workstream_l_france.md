# Workstream L — France coverage

Raise per-leaf coverage of `funding_instruments.eligibility_text` for FR, so a
founder choosing inside a French regime is not left with 48 indistinguishable
siblings. Scoreboard: `npx tsx website/frontend/scripts/measure_sibling_coverage.ts`.

Scope narrowed to **FR only** by the manager mid-task; ES/NO/EU/EE/CZ/SE/IT are
owned by other agents. The one artifact produced before that narrowing is kept
because it is finished and useful to whoever owns ES — see "Handoff" below.

## Baseline (2026-08-06, before any change)

```
multi-leaf regimes 53, holding 797 leaves
eligibility_text over 40 chars: 240 of 1014
  FR 24/133 18%      DE 87/121 72%      ES 3/94 3%
```

France, by regime:

| regime | leaves | with text | missing |
|---|---|---|---|
| `ademe_aid` | 76 | 0 | **76** |
| `satr_fr_rnd` | 43 | 20 | 23 |
| `satr_fr_equity` | 9 | 4 | 5 |
| 5 single-leaf BPI/relance regimes | 5 | 0 | 5 |

`ademe_aid` is the whole French problem: 76 of the 104 missing leaves, at zero
coverage, and it is a genuinely live catalogue — 53 of its 76 leaves have award
years running to 2025 or 2026.

## Sources: what worked and what did not

Recorded the moment each was tested, so the other four agents do not repeat them.

### Dead ends — do not spend time here

| source | result |
|---|---|
| `agirpourlatransition.ademe.fr` (ADEME's own calls portal) | **Cloudflare interstitial** on the bare API path. Standing rule: not impersonated past. Abandoned, not retried differently. |
| `aides-territoires.beta.gouv.fr/api/aids/` | `401 JWT Token not found`. Token needs an interactive registration we cannot do here. |
| `data.ademe.fr` Opendatasoft API (`/api/records/1.0/`, `/api/explore/v2.1/`) | `unknown api endpoint` — the host is **Data-Fair**, not ODS. Correct base is `https://data.ademe.fr/data-fair/api/v1/datasets`. 931 datasets. |
| `data.ademe.fr` dataset `data_aides_themes` (30,166 rows) | Award-grain, not scheme-grain: `dossier_code`, `dossier_objet`, amounts, themes, territory. **No eligibility text, no scheme catalogue.** Same shape as the `ademe_aides.csv` already on disk. |

### Working

| source | result |
|---|---|
| BDNS `convocatorias` API (Spain) | Works, see handoff. |

## Handoff to whoever owns ES

`ETL/terms/fetch_bdns_convocatorias.py` is finished and probed live. Spain's own
call register serves, per convocatoria, exactly the fields the sibling class
needs — `tiposBeneficiarios`, `regiones`, `sectores`, `descripcionFinalidad`,
`presupuestoTotal`, `fechaInicioSolicitud`/`fechaFinSolicitud`,
`descripcionBasesReguladoras`, `organo.nivel3` — over the same WAF-free
`infosubvenciones.es` host `extract_bdns.py` already uses. No scraping, no LLM.

    GET /convocatorias/busqueda?descripcion=<leaf name>   -> codigoBDNS
    GET /convocatorias?numConv=<codigoBDNS>               -> the facts

Two things learned in the 8-leaf trial run, both of which will cost the ES owner
time if rediscovered:

1. `funding_instrument_sources` is recorded at **regime grain, not leaf grain**.
   Joining `s.instrument_id = i.id` selects only the parent and returns nothing
   that needs text. Join on `COALESCE(i.parent_id, i.id)`.
2. Stored leaf `name` is a **truncation** of the call title, so the match
   comparator must be prefix-on-normalised-text in either direction. Equality
   silently loses every truncated leaf.

And one finding that is probably the real ES story: **8 of the first 8 ES leaves
came back `closed`.** A BDNS convocatoria is one annual call, not a standing
programme, so a large share of `bdns_es_ayudas` is expired by construction. If
Spain's sibling class stays large after a full run, the cause is corpus
composition (expired calls kept as rankable rows), not text collection.
