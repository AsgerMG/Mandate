# Workstream U — the EU discriminator, one level below the boilerplate

Branch `workstream-u-eu`. Scope: the EU tier of `funding_instruments`, judged on
`npx tsx website/frontend/scripts/measure_sibling_coverage.ts`.

Steering probe added here: `project-mgmt/probe_eu_regimes.py` — the same residual-class
computation as the scoreboard's headline row, restricted to regimes holding an EU leaf and
reported per regime. The global metric is leaf-weighted over 797 leaves and EU is ~8% of
them, so it cannot tell you which EU regime is still unresolved. Reads Postgres.

---

## FINDING 0 — the handover's numbers were two rounds stale, and the remaining work is a third of what it looked like

The brief handed over "11 of 67 EU covered, `horizon_eu_partnership` 3 abstentions
outstanding". Measured against Postgres at the start of this workstream:

```
regime                     leaves  EU  covered  meanclass
horizon_eu_pillar_ii           10   9        0      10.00   <- unresolved
eit                             9   1        1       7.22   <- see FINDING 3
edf                             3   2        0       3.00   <- unresolved
ipcei                          12  11       11       1.00
innovation_fund                 9   7        8       1.00
horizon_eu_partnership         10   9        9       1.00   <- resolved since the handover
eit_manufacturing / eit_digital / eit_climate_kic       all 1.00
eic                             5   4        4       1.00
chips_ju                        3   2        2       1.00

EU-containing regimes: 11 regimes, 68 leaves, local mean class 3.24
EU rows: 67, with eligibility_text > 40 chars: 47, with administering_body: 17
global: mean class 3.9, uniquely identified 53%
```

So the payable EU work is **`horizon_eu_pillar_ii` (9 live leaves) and `edf` (2 live
leaves)** — 11 rows, not 56. Everything else is either already at class 1.00 or is not a
row a founder can be shown (FINDING 3).

`horizon_eu_partnership` reaching 1.00 does **not** mean its three abstentions were
answered. It means eligibility *text* was written for `euspa`, `ihi` and `sesar_ju`; all
three still carry `administering_body = NULL`, and the diagnosis behind each abstention is
still live. See FINDING 2.

## FINDING 1 — the per-cluster discriminator exists, is verbatim, and is exactly where the brief said it would be

Horizon Europe work programmes are structured so that every call carries a
`Conditions for the Call` table whose `Eligibility conditions` row says, for the ordinary
case, only *"The conditions are described in General Annex B."* That sentence is the
boilerplate: identical across all nine Pillar II clusters by construction, which is why all
nine cite one file (`horizon_eu_general_annexes_2026_2027.pdf`) and why
`harvest_quoted_eligibility.py` correctly refuses every one of them as regime-inherited.

The discriminator is the block that follows *"The following exceptions apply"* /
*"The following additional eligibility conditions apply"*. Cluster 3 (Civil Security),
verbatim from its own work programme:

> This topic requires the active involvement, as beneficiaries, of at least 3 Police
> Authorities from at least 3 different EU Member States or Associated Countries.

> In line with the "restriction on control in innovation actions in critical technology
> areas" delineated in General Annex B, entities established in an eligible country but
> which are directly or indirectly controlled by China or by a legal entity established in
> China are not eligible to participate in the action.

No other cluster says either of those things. That is a condition a sibling would fail,
and it is one `pdftotext -layout` away.

**Each Pillar II cluster has its own work programme part, and none of them were on disk.**
That is the whole reason the regime sat at class 10: the corpus held the shared annex and
nothing else. Staged into `data/raw/instrument_docs/` (gitignored, so the fetch record is
here):

| file | pp | source URL |
|---|---|---|
| `horizon_eu_cl1_wp4_health_2026_2027.pdf` | 211 | `…/wp-call/2026-2027/wp-4-health_horizon-2026-2027_en.pdf` |
| `horizon_eu_cl3_wp6_civil_security_2026_2027.pdf` | 174 | `…/wp-6-civil-security-for-society_horizon-2026-2027_en.pdf` |
| `horizon_eu_cl4_wp7_digital_industry_space_2026_2027.pdf` | 314 | `…/wp-7-digital-industry-and-space_horizon-2026-2027_en.pdf` |
| `horizon_eu_cl5_wp8_climate_energy_mobility_2026_2027.pdf` | 339 | `…/wp-8-climate-energy-and-mobility_horizon-2026-2027_en.pdf` |
| `horizon_eu_cl6_wp9_food_bioeconomy_2026_2027.pdf` | 356 | `…/wp-9-food-bioeconomy-natural-resources-agriculture-and-environment_horizon-2026-2027_en.pdf` |
| `horizon_eu_eie_wp10_innovation_ecosystems_2026_2027.pdf` | 35 | `…/wp-10-european-innovation-ecosystems_horizon-2026-2027_en.pdf` |
| `horizon_eu_miss_wp12_missions_2026_2027.pdf` | 269 | `…/wp-12-missions_horizon-2026-2027_en.pdf` |

Base: `https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/horizon/wp-call/2026-2027/`

### Fetch note worth reusing — `curl` gets a soft-404 where `WebFetch` gets the PDF

The Commission's document host answers repeated `curl` requests from one address with a
**200-status HTML "Page not found" page**, not a 404 and not a 429. Two parts downloaded
cleanly, then five in a row came back as 115KB of HTML while `HEAD` on the same URLs still
reported 200 (the HEAD follows the redirect to the error page). Backing off to 35s between
requests did not help; the same five URLs then returned real PDFs through `WebFetch`, whose
binary passthrough writes the file to the tool-results directory.

So: `HEAD` is not a liveness test on this host, byte-size is, and `WebFetch` → copy the
saved binary → `pdftotext -layout` is the working path. No browser impersonation was used
and none is needed.

## FINDING 2 — the three partnership abstentions are three different defects, and only one of them is a missing fetch

Re-diagnosed against `derive_administering_body_from_docs.py`, which page-reach scores the
legal-form names in each instrument's own document:

- **`sesar_ju` — `top: []`.** Its only linked document, `sesar_ju_qa_document_v1.pdf`,
  contains the string "Joint Undertaking" **zero times**. It writes "SESAR 3 JU"
  throughout. The tool is right to abstain and the fix is not a regex: adding `JU` as a
  legal form would match "the JU" everywhere and manufacture names out of prose. The fix is
  the document. `sesar_ju_bawp_2026_2027.pdf` (67pp, GB(D)08-2025) has been sitting on disk
  since 22 July and opens with the words "SESAR 3 Joint Undertaking" — it is simply not
  linked to the instrument by any row in `eligibility_gates`, `eligibility_clauses` or
  `instrument_application`, because the grounding pass chose the Q&A document for gates
  (correctly — the BAWP has almost no eligibility text) and never recorded the BAWP at all.

- **`ihi` — the knee rule picks a prose run-in and then fails its own floor.** Best page
  reach in `ihi_guide_for_applicants.pdf` is 2, held by "Innovative Health Initiative Joint
  Undertaking". `TOLERANCE = 1` lets a name at reach 1 be selected if it is longer, so the
  winner becomes *"Introduction The Innovative Health Initiative Joint Undertaking"* at
  reach 1, which then fails `MIN_PAGES = 2` and abstains. The correct name lost to a
  sentence that happened to wrap it. This is a general defect, not an IHI one: it fires
  whenever a body's best reach is at or just above `MIN_PAGES`.

- **`euspa` — the document genuinely is not EUSPA's, and no fix to the tool changes that.**
  Its gates were cut from `euspa_horizon_wp7_digital_industry_space_2026_2027.pdf`, which
  `pdfinfo` reports as *"7. Digital, Industry and Space"* — the Horizon Europe Cluster 4
  work programme, 314 pages, EC Decision C(2025) 8493. It is byte-identical (2,263,869
  bytes) to the file this workstream downloaded as `horizon_eu_cl4_…`. The string
  "European Union Agency for the Space Programme" appears in it **once**, so page reach is
  1 and abstention is correct. EUSPA is an EU agency, not a Council-Reg-2021/2085 Joint
  Undertaking, and does not publish a JU-style work programme — the previous grounding pass
  recorded that reasoning in the doc manifest and it is right. The consequence is that
  `euspa` needs a EUSPA-authored source, and that Cluster 4's own work programme has been
  in the corpus all along filed under another instrument's name.

  Not a conflict for the scoreboard: `euspa` sits in `horizon_eu_partnership` and
  `horizon_eu_cl4` in `horizon_eu_pillar_ii`, so they are never siblings and never compete.
  It is still worth saying out loud that they are close to the same offer.

## FINDING 3 — the `eit` regime's class of 7.22 is made entirely of rows a founder cannot be shown

`eit` holds 9 leaves. Eight of them — `eit`, `eit_climate_kic`, `eit_digital`,
`eit_food`, `eit_health`, `eit_innoenergy`, `eit_manufacturing`, `eit_rawmaterials`,
`eit_urban_mobility` — are **containers**: each is the parent of its own sub-regime, and
`live_ids()` excludes parents because they are not offers. The real EIT offers are the
sub-regime leaves (`eit_food_rfs`, `eit_health_catapult`, `eit_digital_vap`, …), and every
one of those already carries eligibility text.

Writing eligibility prose onto those eight rows would take the regime from 7.22 to about
1.0 and move the global mean, while changing nothing any founder ever reads. **That is
coverage bought against the metric rather than against the product**, and this workstream
declines it. Recorded here so the next agent does not read `eit 7.22` as available work.

---

*(in progress — batches below)*
