# SATR-overlap gate — SPRIND projects (Phase A)

_Generated 2026-06-19 (read-only; no DB writes)._

Measured the 197 in-europe-scope SPRIND `sprind_project` ventures (from `data/processed/sprind_projects.csv`) against `satr_staging` (29,931 DE beneficiaries) using the `satr_overlap_audit` normaliser.

## Result

- **Exact normalised-name matches: 46 / 197 (23%)**
- Fuzzy (token-set >=0.85): 0
- Net-new (no SATR match): 151 / 197

## Gate verdict: PASS (load with company-linkage)

SPRIND publishes **no amounts** (all event amounts NULL), so the overlap carries **no money double-count risk**. The 46 matched ventures already exist in the corpus via SATR; at load time (Phase B) the matcher must **link to the existing company row** (exact->fuzzy>=0.92) rather than insert a duplicate. The SPRIND event is a distinct instrument record (equity/validation/challenge) attached to the same company; it does not inflate aid totals.

## Matched ventures (link, do not duplicate)

- Hypersonica (DE, equity)
- Akhetonics (DE, grant)
- Oliment (DE, equity)
- Last Mile Semiconductor (DE, grant)
- TECHiFAB (DE, grant)
- CPTx (DE, equity)
- anabrid (DE, grant)
- Shit2Power (DE, grant)
- Reverion (DE, grant)
- WMT (DE, grant)
- molab.ai (DE, grant)
- Carbo Culture (FI, grant)
- enaDyne (DE, grant)
- Repairon Immuno (DE, grant)
- eLstar Dynamics (NL, grant)
- Cellbricks (DE, grant)
- WeldNova (DE, grant)
- Focused Energy (DE, equity)
- Marvel Fusion (DE, equity)
- foom (DE, grant)
- COLIPI (DE, grant)
- DEEPSPIN (DE, grant)
- Proxima Fusion (DE, grant)
- Pixel Photonics (DE, grant)
- Humify (DE, grant)
- Panosome (DE, grant)
- Ore Energy (NL, grant)
- SEMRON (DE, grant)
- INCIRT (DE, grant)
- brainQr Therapeutics (DE, grant)
- ABSORA (DE, grant)
- aevoloop (DE, grant)
- driveblocks (DE, grant)
- biotx.ai (DE, grant)
- Bluu (DE, grant)
- mcd - modern camera designs (DE, equity)
- ILLUTHERM (DE, grant)
- PolymerActive (DE, grant)
- ConnCons (DE, grant)
- Batene (DE, grant)
- NEUROSPACE (DE, grant)
- Aeon Robotics (DE, grant)
- TQ Therapeutics (DE, grant)
- neoBIM (DE, grant)
- FluIDect (DE, grant)
- WeSort.AI (DE, grant)
