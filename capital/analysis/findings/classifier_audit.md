# Sector classifier audit (2026-06-15)

Triggered by a concrete miss: **Scaleway** (a French cloud/hosting provider) was
classified `cleantech`. This audit traces why and sizes the problem.

## How a company gets its sector

`scripts/classify.py::classify_sector` resolves in this order, first hit wins:

1. **Curated tags** (`sector_tags_raw` matched against hand-built tag sets) — EIC/CORDIS style.
2. **NACE strings** (register rows carry a NACE descriptor) — `_classify_by_nace`.
3. **Keyword fallback** on project title/summary — `_keyword_classify`.
4. **Source default** — a per-source theme map (e.g. `ademe_aid → cleantech`).
5. Else `unclassified`.

Within steps 1–2 a fixed priority applies: space > life_sciences > defense >
cleantech > deeptech_hardware > digital > other.

## What decides the corpus

Instrumented over all 156,836 companies, the deciding step is:

| Deciding step | Companies | Share |
|---|---:|---:|
| Source default or "other"/"unclassified" | 82,961 | 52.9% |
| NACE string | 44,992 | 28.7% |
| Keyword fallback | 23,111 | 14.7% |
| No signal at all | 3,233 | 2.1% |
| Curated tags | 2,539 | 1.6% |

**More than half the corpus is classified by the weakest mechanism** — the
funding programme's theme, not the company's own business.

## The cleantech inflation

| Metric | Value |
|---|---:|
| Companies classified `cleantech` | 34,758 |
| ...of which are ADEME-funded | 17,020 (49%) |
| Sector split of ADEME-funded companies | cleantech 17,020 / life_sciences 864 / other 548 / deeptech 170 / digital 145 / space 42 / defense 12 |

ADEME (France's ecological-transition agency) carries one rule: `ademe_aid →
cleantech`. It fires for ~90% of ADEME-funded companies because the stronger
signals above it have gaps. So **half of all "cleantech" companies are cleantech
mainly because ADEME paid them**, regardless of what they actually do. Scaleway
is one of the 17,020: its NACE ("Rental and leasing of office machinery,
equipment and computers") was not in the NACE map, so it fell through to the
ADEME default.

## Root causes

1. **NACE coverage is thin.** 802 of 1,080 distinct SATR NACE strings are
   unmapped, covering 50,087 of 122,814 NACE-bearing events (40.8%). These
   companies skip step 2 and fall to source defaults. Top unmapped strings are a
   mix of clearly-classifiable (computing infrastructure, rental of computers,
   tertiary education, wholesale) and genuinely ambiguous (other manufacturing,
   fabricated metal, chemicals) descriptors.
2. **Source defaults are too coarse to be a primary signal.** ADEME funds
   digital, mobility and circular-economy projects too; a single theme per source
   cannot describe a company. The default is a reasonable *last resort* but is
   doing primary work because of (1).
3. **Priority order conflates project theme with company business.** A digital
   company with a green-tinted project can resolve cleantech because cleantech
   outranks digital.

## Fix sequence (executed)

- **Phase 1 (9b79460): high-confidence NACE gaps.** computing/hosting → digital;
  electrical equipment → deeptech; clearly non-tech → other. Scaleway → digital.
  3,448 flips, 3,268 previously-unclassified bucketed.
- **Phase 1b (87b43e4): more NACE + EIT domain codes.** unclassified 54,777 → 48,930.
- **Phase 2 (8ca9b96): French public bodies.** Communauté de communes, Mairie,
  SICTOM/SIVOM syndicates, Métropole, Département → entity_type `other`; they drop
  out of company-level analyses. 408 entities.
- **Phase 3 (this pass): comprehensive NACE-division coverage.** Map the whole NACE
  taxonomy by division (machinery → deeptech; recycling/energy/water → cleantech;
  information & communication → digital; agriculture, lower-tech manufacturing,
  trade, construction, business services → other), plus Spanish GBER environmental
  aid articles → cleantech (the investment is the activity; generic R&D/SME articles
  left unclassified — no business signal). 12,537 flips, unclassified 48,930 → 37,075
  (31.2% → 23.6%). Spot-checked: recyclers → cleantech, farm/laser-machinery makers
  → deeptech, IT firms → digital.

## What is left unclassified (23.6%)

Two irreducible-ish buckets: (a) ~17k companies with no NACE/tag at all (only a
source and an amount) — addressable only by name/keyword inference; (b) register
rows whose only label is aid-legal-basis boilerplate that names the grant, not the
business (Spanish ART. 22/25/28/29 generic R&D/SME aid, Polish SUDOP regulations,
Danish "Ikke defineret"). Mapping (b) would re-introduce theme-over-business error,
so it stays unclassified by choice. Next lever for the gap is (a): multilingual
name/keyword classification, accepting lower precision than NACE.
