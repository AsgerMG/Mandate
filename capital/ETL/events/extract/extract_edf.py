"""Extract European Defence Fund (EDF) awarded project coordinators from
individual per-project PDF factsheets published on defence-industry-space.ec.europa.eu.

Data source:
  Per-call results pages on:
    https://defence-industry-space.ec.europa.eu/
  Each awarded project has a PDF factsheet containing:
    - Page 1: project acronym, title, call title (→ RA/DA), topic (capability area),
              activity types (→ RA/DA for 2021 where call title is capability area),
              estimated total cost, maximum EU contribution
    - Page 2+: consortium member table with coordinator marked "(Coordinator)"

Scope (v1, sprint 6):
  - 60 EDF 2021 projects (awarded 2022-07-20)
  - 41 EDF 2022 projects (awarded ~2023-05)
  - 61 EDF 2023 projects (awarded ~2024-05)
  - 62 EDF 2024 projects (awarded ~2025-05)
  - 57 EDF 2025 projects (awarded 2026-04-15)
  Total: 281 coordinator events

  RA/DA determination:
    EDF 2022–2025: "Call title" field says "Research actions" or
                   "Development actions" explicitly.
    EDF 2021:      "Call title" is the capability area (e.g. "Cloud technologies").
                   Infer from "Type(s) of activities": if "Research" appears → RA;
                   otherwise (Studies, Design, Prototyping, Testing, …) → DA.

Coordinator-only capture (Option A): same convention as Innovation Fund and
Chips JU. Only the consortium lead is loaded.

Amount: "Maximum EU contribution" from the factsheet = EU grant ceiling.
Stored in grant_amount_eur. "Estimated total cost" (EU + national co-funding
combined) is NOT stored — same caveat as Chips JU shv_totalinvestment and
IPCEI state-aid totals.

Run modes:
  python extract_edf.py             → fetch PDFs + CSV only (no DB write)
  python extract_edf.py --load-db   → fetch + match + load into db.sqlite
  python extract_edf.py --refresh   → re-download all PDFs even if cached
"""
from __future__ import annotations


# --- ETL path bootstrap (auto-added; see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from europe_scope import COUNTRY_NAME_TO_ISO2, name_to_iso2  # noqa: E402
from etl_env import DB as _ETL_DB, ROOT as _ETL_ROOT  # noqa: E402,F401
# --- end ETL path bootstrap ---

import csv
import re
import sqlite3
import subprocess
import sys
import time
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("pdfplumber required: pip install pdfplumber")
    sys.exit(1)

BASE_DIR = _ETL_ROOT
RAW_DIR = BASE_DIR / "data" / "raw" / "edf"
OUT_DIR = BASE_DIR / "data" / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)
RAW_DIR.mkdir(parents=True, exist_ok=True)

CSV_PATH = OUT_DIR / "edf_projects.csv"
MATCH_CSV_PATH = OUT_DIR / "edf_match_summary.csv"
DB_PATH = _ETL_DB

EDF_BASE_URL = "https://defence-industry-space.ec.europa.eu"

# ---------------------------------------------------------------------------
# All factsheet PDF URLs per call year (hard-coded from results pages)
# EDF 2021 awarded 2022-07-20 | EDF 2022 awarded ~2023-05-01
# EDF 2023 awarded ~2024-05-01 | EDF 2024 awarded ~2025-05-01
# EDF 2025 awarded 2026-04-15
# ---------------------------------------------------------------------------

# Format: list of (url, awarded_date) per call year key
_EDF_2021_AWARDED = "2022-07-20"
_EDF_2022_AWARDED = "2023-05-01"
_EDF_2023_AWARDED = "2024-05-01"
_EDF_2024_AWARDED = "2025-05-01"
_EDF_2025_AWARDED = "2026-04-15"

# Each entry: full document/download URL
EDF_FACTSHEET_URLS: dict[str, list[tuple[str, str]]] = {
    # --- EDF 2021 (RA/DA determined from activity type in PDF) ---
    "edf_2021": [
        (EDF_BASE_URL + "/document/download/8cdd3f5c-a8c7-4762-9b8d-8405a6c1e62f_en?filename=Factsheet_EDF21_EPIIC.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/a6212405-673a-4303-add1-1be662c381ba_en?filename=Factsheet_EDF21_EICACS.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/eabefa01-73ef-4ed1-a3ad-1036c42711d1_en?filename=Factsheet_EDF21_ENGRT.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/4ce1a6be-64db-4361-9010-8b7860bbd996_en?filename=Factsheet_EDF21_EU%20HYDEF.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/c1fc3354-cfc4-4a45-be6b-7db1a4225bd1_en?filename=Factsheet_EDF21_5G%20COMPAD.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/35e43911-a53b-4284-b52d-1fb810a010dc_en?filename=Factsheet_EDF21_EuroHAPS.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/c8434c9f-1a4e-4ed7-b5dd-1b35184a858e_en?filename=Factsheet_EDF21_ACTING.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/cbf2b95c-9327-421c-80af-4ad1f3c95688_en?filename=Factsheet_EDF21_Ainception.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/ae8bc3c6-cdbc-4eb2-a9aa-dca6ab8c140f_en?filename=Factsheet_EDF21_EU-GUARDIAN.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/ade27d7c-f9b6-49a0-b2fb-f621d6abe897_en?filename=Factsheet_EDF21_EDOCC.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/8914eb59-3a75-438a-bb73-7b6a7616a656_en?filename=Factsheet_EDF21_KOIOS.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/6d8f2b23-b9b1-4d28-8ccf-0312551e6c0b_en?filename=Factsheet_EDF21_FaRADAI_0.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/9584f2f6-d1fd-413c-a0fb-38ae6c2a1f15_en?filename=Factsheet_EDF21_ROLIAC.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/58c80d0f-2ef1-4ee0-b710-f48600c067a4_en?filename=Factsheet_EDF21_ENLIGHTEN.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/603b1be5-68aa-4342-993e-0f6cb12bbc3e_en?filename=Factsheet_EDF21_ADEQUADE.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/04ead0c7-bfca-49fe-9800-bfdd565242df_en?filename=Factsheet_EDF21_iFURTHER_1.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/f2fefde8-bdef-4c76-914b-b7b040a2a988_en?filename=Factsheet_EDF21_INDY.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/88c9e683-680c-4b88-b44b-d99802ec99e0_en?filename=Factsheet_EDF21_NEUMANN_0.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/ae407ddb-2ad9-4b98-a66a-1732d11e9f95_en?filename=Factsheet_EDF21_NOMAD.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/a4a03791-1afc-4ca5-ae95-157e1abb282a_en?filename=Factsheet_EDF21_MARSEUS.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/98c8f459-407d-4b88-8f26-2ffd4e9b2a93_en?filename=Factsheet_EDF21_FAMOUS2.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/982f8375-314d-463b-846f-892e55475df5_en?filename=Factsheet_EDF21_NEWHEAT.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/e3680cf7-de3f-48a5-aa7c-6e04c3999814_en?filename=Factsheet_EDF21_COMMANDS.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/9078d9af-b7b5-4fc1-807c-c1f5c25df76e_en?filename=Factsheet_EDF21_ECOBALLIFE.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/ddac55e0-a366-4c3b-867c-a589e3edef9c_en?filename=Factsheet_EDF21_AGAMI_EURIGAMI.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/279dc793-3104-4bf1-8b12-3376c7a8e1b0_en?filename=Factsheet_EDF21_COUNTERACT.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/5e4a3b1e-ac90-436d-9a88-69128fc6fbd8_en?filename=Factsheet_EDF21_TeChBioT.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/1de67ba4-237d-4638-b204-a86d59e6d213_en?filename=Factsheet_EDF21_MOSAIC_updated.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/d2276601-5e9d-4efe-818d-192f23313ef6_en?filename=Factsheet_EDF21_EPC.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/4292fe70-0b0f-4376-81fd-21509b6ea641_en?filename=Factsheet_EDF21_EDINAF.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/103a9c46-7f31-4e73-932c-a91559dea436_en?filename=Factsheet_EDF21_dTHOR.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/4099245e-8d77-4d12-95fb-271cb907f681_en?filename=Factsheet_EDF21_ALADAN_0.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/0fa499b2-c07f-484b-ad0c-d41c58c73826_en?filename=Factsheet_EDF21_ABITS.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/c362f598-87c0-4a8e-8b52-875fc7262dc8_en?filename=Factsheet_EDF21_HYBRID.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/f576be61-1dfa-4f06-8324-7ecd3c61a5f2_en?filename=Factsheet_EDF21_SPRING.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/a05a12f3-55bc-4f3f-9ed3-46552417a11b_en?filename=Factsheet_EDF21_ALTISS.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/f47f2439-8d0e-47b5-841d-e8476a9c744c_en?filename=Factsheet_EDF21_SHOLFEA.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/3b6fc33a-f902-4f98-9ae3-02b0018d2ffc_en?filename=Factsheet_EDF21_RFSHIELD.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/03e32b31-8fd5-47a1-9f6f-43b01b39d38f_en?filename=Factsheet_EDF21_NAUCRATES.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/3d68b47d-ec70-4258-bfb8-9198cbfa1c14_en?filename=Factsheet_EDF21_P2P-FSO.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/7db1e691-ee1a-48e8-9f9a-4b0e61e179ee_en?filename=Factsheet_EDF21_POWERPACK.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/4f5d31b7-5387-4713-9af4-399861f1fd7c_en?filename=Factsheet_EDF21_POWERFLEX.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/40839282-e025-4822-890a-712a5d77681c_en?filename=Factsheet_EDF21_SMiEQ.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/32c7c73a-d6f6-4209-ae69-c19d23a53def_en?filename=Factsheet_EDF21_HIDRA.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/51d4ed6c-1b82-4252-8cd7-f156800e6b4f_en?filename=Factsheet_EDF21_IntSen2_updated.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/f5d0f500-ff14-4bd9-9321-403f111054bb_en?filename=Factsheet_EDF21_LODESTAR.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/597dd769-cb0c-4227-aa64-f49473328c59_en?filename=Factsheet_EDF21_Mini-BOT.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/fc612e3e-fb75-4af5-9b19-6d22c2e03fdd_en?filename=Factsheet_EDF21_SEAWINGS.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/4eea87e8-b5a2-4cc2-8f3a-4050ea7dd196_en?filename=Factsheet_EDF21_Nano-SHIELD.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/e97930f9-db47-4d05-b6a8-7ff639efef98_en?filename=Factsheet_EDF21_Q-SiNG.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/93467064-474d-4551-bd44-303a134fba38_en?filename=Factsheet_EDF21_FIBERSENSE.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/0cd01460-b893-4d7f-8fe6-98580d94e46f_en?filename=Factsheet_EDF21_Facelift.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/1a7f7e58-4e44-442a-804f-5f40f416631d_en?filename=Factsheet_EDF21_AMLTD.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/278a9820-d0a9-4303-89f2-293b633300e9_en?filename=Factsheet_EDF21_HEGAPS.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/d16fdacb-b613-40ee-ab30-0d684c70c09b_en?filename=Factsheet_EDF21_%20ACHILE_0.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/7e22b1b5-0326-45cd-81b3-2f2b6429cefa_en?filename=Factsheet_EDF21_SDMMS.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/15e0400c-8cb6-47b5-9924-f67e0ed4fce8_en?filename=Factsheet_EDF21_HEROIC.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/7e924a3a-ea4b-4827-befa-707eec2c8a30_en?filename=Factsheet_EDF21_ARTURO.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/547e34eb-6926-4a72-86bd-1eace24b894c_en?filename=Factsheet_EDF21_EPW.pdf", _EDF_2021_AWARDED),
        (EDF_BASE_URL + "/document/download/2bc14163-d21d-4032-8a3f-03cabe10cdc9_en?filename=Factsheet_EDF21_Navguard.pdf", _EDF_2021_AWARDED),
    ],
    # --- EDF 2022 (RA/DA from call title: "Research actions" / "Development actions") ---
    "edf_2022": [
        (EDF_BASE_URL + "/document/download/cadd89ef-7224-448e-ab55-2a590a5de4e0_en?filename=REACTII-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/abca2b84-bbba-409c-958d-a0767637b76a_en?filename=EUCINF%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/2a10a36d-5e42-432e-bb06-ebc690797abe_en?filename=FACT%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/2b093e47-fcdc-4682-bd86-00ad843eb3ff_en?filename=NEWSROOM-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/0b7d71d9-a4bb-4148-991a-2d15db0db957_en?filename=STORE-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/da2c0bb8-45a2-4f78-a855-c20ed0d1d675_en?filename=AIDEDex%20-%20Factsheet_EDF22_0.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/3fa31a57-b327-483c-a660-f96190170a7a_en?filename=CONVOY%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/65eba4e7-ffa0-4416-bba3-a79a07859dca_en?filename=DeterMine%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/86cb1256-9941-4af1-98c6-f691d532bf63_en?filename=HiTDOC-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/a09dc0b5-04e2-4571-8757-08774c5c0b8f_en?filename=TICHE%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/da39faf6-d33e-48c7-8c35-2426497a2725_en?filename=ACROSS%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/bdca1491-b549-4265-9e9d-7a1b08d6c8c3_en?filename=DISCMAM%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/23f7f764-56c3-4ef5-a17c-575a2b84eef5_en?filename=SILENT-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/23f871ca-2033-48e0-bce8-4f3fe21ac42a_en?filename=THEMA%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/b5e205b2-3b6f-46e8-8457-50f91686bf97_en?filename=SCUALE-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/8b127340-eacf-4855-874f-d1e56bb0497d_en?filename=FASETT%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/7b2dec2b-6a52-4d9e-be5b-0c1b0ccdf133_en?filename=LATACC-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/4ec0808c-6771-4f17-a2ed-71968674e92f_en?filename=EC2%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/319ceeab-2851-4419-b491-b42c7a9a64d8_en?filename=PROTEAS-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/a6df9e17-ca76-4f3f-ae2b-a912dd4367e6_en?filename=SESIOP-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/52dffe47-79f8-453f-b234-6dca72ac1b11_en?filename=ARMETISS%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/220ebc37-cbd0-466f-98c4-744f1f44172f_en?filename=EPICURE%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/097a6a49-7604-453d-a674-1fcd13f1d90e_en?filename=iMEDCAP-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/44b52bbc-353a-4b29-bac7-3ffa3e9489fc_en?filename=RESILIENCE%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/7755c8f1-4117-4c5c-b6cc-24be9022d12c_en?filename=E-NACSOS%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/f2b33646-76ce-42a1-b872-e5cab4c1b0a3_en?filename=EUROGUARD%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/5ca041ce-d864-4f2e-a2d4-7a21c34ee637_en?filename=EOA%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/7a019694-28a6-4170-8faa-63e3b397347f_en?filename=EAGLES%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/4ec0d9ca-69d0-4a9b-9203-9aef4e1a049f_en?filename=PASITHEA-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/31923d3d-7ec7-4389-bc76-97d35e459f5c_en?filename=TDRIC-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/3211576e-184f-421b-ab2a-c11cbde0a092_en?filename=UTILE%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/9eb19d57-818b-4f50-a07b-715291444fcd_en?filename=WEMOR%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/2d480392-f067-4f83-b3dc-1870d3b78488_en?filename=HARTROID-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/fbfa0865-aba3-46f6-9a19-2fcc4771eb0d_en?filename=TRAVISMOS%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/d9811083-e6ba-4562-acad-a2f47c43f8c0_en?filename=CASSATA%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/fc48fa97-8669-4268-8234-ded485c3c8a1_en?filename=TIRESYAS%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/2323e186-afd1-43e8-860a-4c910563a680_en?filename=FEDERATES%20-%20Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/3d80aee3-404c-4207-b8fa-5df7310668e1_en?filename=ODINS%27EYE%20II-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/0706cd20-9916-4b2d-b81d-c9f26af21677_en?filename=REACTS-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/9f00fdbd-9c0b-4e7e-bda1-0078d8ccbb2e_en?filename=SPIDER-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
        (EDF_BASE_URL + "/document/download/2f9fe454-324a-4c29-a3df-0864d73b7c45_en?filename=SWAT-SHOAL-Factsheet_EDF22.pdf", _EDF_2022_AWARDED),
    ],
    # --- EDF 2023 ---
    "edf_2023": [
        (EDF_BASE_URL + "/document/download/a609a2d5-4f7a-4382-97a9-4092b9d6d59e_en?filename=FACTSHEET_EDF-2023-LS-RA-DIS-NT_101167898_VICTORIOUS.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/3d798e87-bdc4-4c89-9992-dc6db5d38d89_en?filename=EDF-2023-LS-RA-DIS-NT%20LACE.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/99d9e746-9a4f-487a-b888-6aeb0350ffe6_en?filename=EDF-2023-RA-SI-MATCOMP-HPM_101168222_ADMIRABLE.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/a52424bb-2d29-46a5-bbb7-28df1545443c_en?filename=EDF-2023-RA-SI-CYBER-ASPT%20TRITON.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/5b53c2c1-a65c-44d9-b359-47c6c411e22a_en?filename=EDF-2023-RA-SI-MATCOMP-HPM%20IMMUNE.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/23947d22-222b-4749-a82b-604858338a9c_en?filename=EDF-2023-RA-SI-ENERENV-IPS%20CALIPSO.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/cf407fd3-a689-4322-9114-c554085c3024_en?filename=EDF-2023-RA-SGA-MCBRN-MCM%20RESILIENCE-R-2023.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/ecb0cfdb-ca41-4d13-a6f2-62539c0ca982_en?filename=EDF-2023-RA-SENS-EMSP_FESPAN.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/65d46aa9-6767-4aff-9591-3dacdfd6df64_en?filename=EDF-2023-RA-SENS-OPTD_ECOSYSTEM.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/cc98a1de-a7d4-481c-b6e8-0e565d491d1c_en?filename=EDF-2023-RA-PROTMOB-SATOC%20ESOCA.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/9ea71b6f-afea-4cd9-bc2d-210d83e18220_en?filename=EDF-2023-RA-DIGIT-HAAI%20ARCHYTAS.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/cae8b297-58e8-4a70-8964-9b4a098c0342_en?filename=EDF-2023-RA-PROTMOB-DEXPLO%20GENIUS.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/b0a96ff5-09c1-4d47-981f-eb2fceed1ab5_en?filename=EDF-2023-LS-RA-SMERO-NT_MINEFIELD.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/6abd0f72-808a-4c1d-8b2e-b271abdb1db7_en?filename=EDF-2023-LS-RA-SMERO-NT%20STEALTH.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/f7d2b036-4d0e-4eda-838a-109383f667d8_en?filename=EDF-2023-LS-RA-SMERO-NT%20SEQURED.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/3b181182-25f5-43bc-9190-f68ddfb769a1_en?filename=EDF-2023-LS-RA-SMERO-NT%20RAPTOR.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/3450637f-33bd-40a9-acdf-4734e338db44_en?filename=EDF-2023-LS-RA-SMERO-NT%20OPERANT.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/ecc503f3-a23d-41d2-b427-ba684e01218c_en?filename=EDF-2023-LS-RA-SMERO-NT%20HSM4COM.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/1fe636e3-b83c-477c-bf04-63d1feb3749b_en?filename=EDF-2023-LS-RA-SMERO-NT%20DEMETHRA.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/0f13f14d-89c5-427a-8b08-81295bb54d1e_en?filename=EDF-2023-LS-RA-SMERO-NT%20CATHERINA.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/eff53f47-1c5d-449b-b8b3-9aa2e548dcb2_en?filename=EDF-2023-LS-RA-SMERO-NT%20DAEDALUS.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/49c57e3c-e1ca-475c-8012-760cc8ab8ee9_en?filename=EDF-2023-LS-RA-SMERO-NT%20AVALON.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/811ed42c-5a82-4a59-b708-fe346f29252a_en?filename=EDF-2023-LS-RA-SMERO-NT%205G-MILNET.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/5edc52a6-e5cd-4db9-bbc4-7546e2bd31f5_en?filename=EDF-2023-LS-RA-DIS-NT%20SWARM-C3.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/71484380-7544-4ef6-9619-46fa89047f91_en?filename=EDF-2023-LS-RA-DIS-NT%20S.W.I.F.T.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/ff04dc72-223c-4818-b79b-d50f7fec898e_en?filename=EDF-2023-LS-RA-DIS-NT%20DEMAROCK.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/a50a4c59-b306-45a3-b71b-1282c8ff44db_en?filename=EDF-2023-LS-RA-CHALLENGE-DIGIT-HLTP_NEMO.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/de830426-7142-4a72-961b-f7abcaa739b6_en?filename=EDF-2023-LS-RA-DIS-LDEW%20TALOS-TWO.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/047f5f44-e73d-425b-a0cf-56fd866f596c_en?filename=EDF-2023-LS-RA-CHALLENGE-DIGIT-HLTP_LINGUARISE-DC.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/2d7c0e41-1e37-49c4-b28d-96a4808141fa_en?filename=EDF-2023-LS-RA-CHALLENGE-DIGIT-HLTP_AtLaS.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/ac9bb144-91c9-4fd7-9e2e-0eda8715f2e3_en?filename=EDF-2023-LS-RA-CHALLENGE-DIGIT-HLTO_ARCHER.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/ad1f8c7c-f83b-4a4b-b76e-2cbc291fefc4_en?filename=FACTSHEET_EDF-2023-LS-RA-SMERO-NT_101168102_CAPSARII%20v2.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/20650702-8a82-4322-bdbc-73de4e3641d8_en?filename=FACTSHEET_EDF-2023-LS-RA-DIS-NT_101168008_ACTOR%20v2.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/443418e0-eaa1-4f39-863b-64d35bd2ba48_en?filename=FACTSHEET_EDF-2023-LS-RA-SMERO-NT_101168119_ZEROWASTE%20v2_0.pdf", _EDF_2023_AWARDED),
        # DA projects
        (EDF_BASE_URL + "/document/download/dfcec3d7-df67-4fc4-a7ea-0e5362ce204c_en?filename=EDF-2023-RA-SPACE-PSA%20BODYGUARD.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/32604a9c-bffa-48ce-905e-86b320b81446_en?filename=EDF-2023-DA-UWW-ASW%20SEACURE.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/3948c891-f16f-428e-a4c0-f4c7763d2c88_en?filename=EDF-2023-DA-NAVAL-MMPC%20EPC2.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/f90f0035-bd4a-4bfe-aa64-a891d4c609d3_en?filename=EDF-2023-DA-SPACE-SSA_EMISSARY.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/c2d3522a-25fc-45c4-b158-5050df34bfbe_en?filename=EDF-2023-DA-SENS-GRID_EISNET.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/dbcc3c8e-a982-45be-a3cd-ffc60c8382a9_en?filename=EDF-2023-DA-MATCOMP-MJR-CBDIN%20MaJoR.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/b816bef0-0a9f-439d-9f30-2dfc97373b55_en?filename=EDF-2023-DA-GROUND-MBT%20MARTE.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/37439eaf-8092-4e5b-ba7d-216ec4fa891b_en?filename=EDF-2023-DA-GROUND-MBT%20FMBTech.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/f9c0d019-eace-48c1-a926-220688cb560f_en?filename=EDF-2023-DA-GROUND-IFS%20FIRES%202.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/662f7204-c551-41ba-a1a0-680d7dc65c6e_en?filename=EDF-2023-DA-DS-AIRDEF-EATMI_HYDIS%C2%B2.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/c205c93a-9c7f-4914-8161-a5b57a31df76_en?filename=EDF-2023-DA-CYBER-CSA%20ECYSAP%20EYE.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/f1aa1eeb-a368-41ab-be91-54728c24ccba_en?filename=EDF-2023-DA-CYBER-DAAI%20AIDA.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/8817c0c4-dedb-46e2-9d02-30be8da42b24_en?filename=EDF-2023-DA-C4ISR-TRPAS%20ACTUS.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/ffafa5ba-3412-482a-aa1f-7a21fec7e7af_en?filename=EDF-2023-DA-C4ISR-LCOM%20OPTIMAS.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/4ad05af1-5bee-4412-84bc-7e616f7777f8_en?filename=EDF-2023-DA-C4ISR-DAA%20EUDAAS2.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/92e597fe-b960-4860-983a-9136a1087ad1_en?filename=EDF-2023-DA-AIR-STFS%20NG-MIMA.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/61107a24-8b80-4c9a-8319-02ffead62d93_en?filename=EDF-2023-DA-AIR-SPS%20CARMENTA%20PF.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/d2719294-4288-43b4-9093-a2bc6134ace4_en?filename=EDF-2023-DA-AIRDEF-CUAS%20E-CUAS.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/4750730e-a4bb-4bc2-b31e-16c62a75aa1a_en?filename=EDF-2023-_DA-MCBRN-FCS%20CBRN%20SoS.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/f30135fc-ac07-4718-b74b-86274d87f838_en?filename=EDF-2023-DA-UWW-MCMC%20EequalMCM_V2.1.pdf", _EDF_2023_AWARDED),
        # DA SME
        (EDF_BASE_URL + "/document/download/4883304e-4d42-4c69-8ecc-388159cb1b1d_en?filename=FACTSHEET_EDF-2023-LS-DA-SME-NT_101168111_MPortISTAR.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/96d634d1-27bc-4843-80b9-83dfd9d22d18_en?filename=EDF-2023-LS-DA-SME-NT%20STAALION.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/fa98a69e-a4ff-4ed9-a84f-f5d34492b17b_en?filename=EDF-2023-LS-DA-SME-NT%20SDAM4PRD.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/91c6baad-a511-47e9-9b2f-6809ee3de053_en?filename=EDF-2023-LS-DA-SME-NT%20SRB2.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/5ded1d0f-1073-4735-bdee-5a0810e01a95_en?filename=EDF-2023-LS-DA-SME-NT%20ARROW.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/2d989e09-4948-4adc-a3a2-ec74810f693a_en?filename=EDF-2023-LS-DA-SME-NT%20BATTLEPAD.pdf", _EDF_2023_AWARDED),
        (EDF_BASE_URL + "/document/download/9385b84d-c98c-4263-878f-283e28000cba_en?filename=EDF-2023-LS-DA-SME-NT%20BadB.pdf", _EDF_2023_AWARDED),
    ],
    # --- EDF 2024 ---
    "edf_2024": [
        (EDF_BASE_URL + "/document/download/f8ef7c08-a906-4537-b94b-13be2689483d_en?filename=FACTSHEET_EDF_2024_RA_SENS_ART_101224281_SCEPTER.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/09cedfb0-8beb-432a-aa80-a35f66fe06fd_en?filename=FACTSHEET_EDF_2024_DA_AIR_NGRT_101224727_ENGRT_II.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/beae3862-98a4-48c5-80db-0b189f6c695a_en?filename=FACTSHEET_EDF_2024_RA_AIR_UCCAS_STEP_101224274_GARUDA.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/bd6f7779-a51b-4150-aefe-d5a2ae15e148_en?filename=FACTSHEET_EDF_2024_HYROGLIVE.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/35ffd338-b7b8-4f74-acfb-fad9383d4271_en?filename=FACTSHEET_EDF_2024_RA_AIR_AAM_101224302_BEAST.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/d372aa7e-8ff3-4582-a639-6cce3bf4445f_en?filename=FACTSHEET_EDF_2024_DA_CYBER_NGCR_STEP_101224382_CITADEL_Range.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/b73afd99-27a9-4bf3-a73a-679747880c75_en?filename=FACTSHEET_EDF_2024_RA_DIGIT_ASMEP_101224145_PRECISE.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/28823c44-775d-4b67-a25d-cbd48013ec26_en?filename=FACTSHEET_EDF_2024_LS_RA_DIS_NT_101224587_ABBOT.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/a3be8835-2c70-4b1f-8681-6c5aa22f3ebd_en?filename=FACTSHEET_EDF_2024_LS_RA_DIS_NT_101224241_HARVEST.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/1823f318-d667-41a3-9b59-0c3117ecc198_en?filename=FACTSHEET_EDF_2024_LS_RA_DIS_NT_101224711_INNOSWAMP.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/26ce99f9-f8b7-449f-ae3d-d9dd0e120cb5_en?filename=FACTSHEET_EDF_2024_LS_RA_DIS_NT_101223974_METASTEALTH.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/08cc3dee-a4a1-48de-80d4-cd97f122babe_en?filename=FACTSHEET_EDF_2024_LS_RA_DIS_NT_101224494_NEUROQUAD.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/bc8bb6b1-fa24-4d44-b683-9f82b9321f25_en?filename=FACTSHEET_EDF_2024_LS_RA_DIS_NT_101224092_Silfrared.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/5a308169-efa7-498f-a090-78fbb26e3adc_en?filename=FACTSHEET_EDF_2024_LS_RA_DIS_QUANT_STEP_101224573_ORQESTRA.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/c421855b-0df4-4a57-abd2-4598a842ff80_en?filename=FACTSHEET_EDF_2024_LS_RA_DIS_QUANT_STEP_101224135_Q_ARM.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/87e7f6e6-d61e-4291-a900-bb28285f1bd4_en?filename=FACTSHEET_EDF_2024_LS_RA_DIS_QUANT_STEP_101224744_SQORPION.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/3bb03680-d415-47a7-a470-3e0a781a298a_en?filename=FACTSHEET_EDF_2024_DA_ENERENV_EEMC_STEP_101224400_SENTINEL.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/5bdea977-521a-4923-9e65-5a7dc9440170_en?filename=FACTSHEET_EDF_2024_RA_PROTMOB_FMTC_101224375_FASETT2.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/f1c9a2df-5000-48dc-bd28-1e9832fb2a22_en?filename=FACTSHEET_EDF_2024_DA_GROUND_AIFV_101224662_AURIGA.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/01872011-1fdc-4a2c-9227-e4636790851e_en?filename=FACTSHEET_EDF_2024_DA_GROUND_BLOS_101224170_AktarEUs.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/02ca40f5-e0c1-40c5-8bd0-198e0b4ed06e_en?filename=FACTSHEET_EDF_2024_DA_GROUND_UGS_STEP_101223988_iMUGS2.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/61b1ad3e-825c-4807-867d-fcdd6ddc7738_en?filename=FACTSHEET_EDF_2024_RA_GROUND_IWAS_101224095_NINJA2.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/0e5917eb-3e04-421e-a010-bfb0b2d4c5bf_en?filename=FACTSHEET_EDF_2024_DA_C4ISR_AIMA_STEP_101224193_AI_WASP.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/26791634-5eeb-478e-8bbc-f28622b582f0_en?filename=FACTSHEET_EDF_2024_DA_C4ISR_COMS_STEP_101218568_5G_COMPAD_2_0.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/21d5a469-c47f-4684-8ece-eaff846e2d25_en?filename=FACTSHEET_EDF_2024_DA_C4ISR_SEEU_STEP_101224328_Small_UAS.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/ea552399-ceb2-4a20-a8df-3f354231f420_en?filename=FACTSHEET_EDF_2024_DA_C4ISR_SEEU_STEP_101224352_VANTAGE.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/f623b510-5c78-489b-a5dd-e3db717e3e54_en?filename=FACTSHEET_EDF_2024_RA_SI_MATCOMP_EC_STEP_101224231_ePERFECT.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/af559dc4-6f04-493d-862d-8c5a4f33ab35_en?filename=FACTSHEET_EDF_2024_DA_SGA_MCBRN_MCM_STEP_101201939_RESILIENCE_D_2024.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/5bc89c29-9c68-4350-9893-d6c9e27401c3_en?filename=FACTSHEET_EDF_2024_RA_SGA_MCBRN_MCM_STEP_101201953_RESILIENCE_R_2024.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/856d35b9-f71d-4985-83c6-bb9f798eedfb_en?filename=FACTSHEET_EDF_2024_DA_NAVAL_FNP_101224749_NEREUS.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/c52dfcbc-3d6f-4aee-9d8c-31562ca241f7_en?filename=FACTSHEET_EDF_2024_LS_DA_SME_NT_101223983_AQUILA.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/c11494cb-e44a-4c63-91f7-605dad82cf75_en?filename=FACTSHEET_EDF_2024_LS_DA_SME_NT_101224398_CAMO_V2.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/38a4b892-16da-4c6f-909e-6cc544ebb180_en?filename=FACTSHEET_EDF_2024_LS_DA_SME_NT_101224266_COP_GPT.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/a93960c3-129f-4200-ad8c-047f105f1a71_en?filename=FACTSHEET_EDF_2024_LS_DA_SME_NT_101224172_HARPIA_Defence.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/ea321c83-69d0-4a1c-8e1d-f154ef9884ea_en?filename=FACTSHEET_EDF_2024_LS_DA_SME_NT_101223905_LODESTAR_II.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/f9f1d4e9-2240-4339-aa07-341824dcb5e7_en?filename=FACTSHEET_EDF_2024_LS_DA_SME_NT_101224544_SIGMA.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/ac9a4ba9-2c38-4e53-b3af-9792f3f9d709_en?filename=FACTSHEET_EDF_2024_LS_DA_SME_NT_101224060_SVDC.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/f465b570-7902-400b-a93f-124abd030b11_en?filename=FACTSHEET_EDF_2024_LS_DA_SME_NT_101224518_VEODDA.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/8f63d530-98c0-4d30-839d-19727b15c5e4_en?filename=FACTSHEET_EDF_2024_LS_RA_SMERO_NT_101224636_ARRAYS.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/b3a86a0f-78a5-4271-b9c1-8fbda52d3005_en?filename=FACTSHEET_EDF_2024_LS_RA_SMERO_NT_101224541_DAMAGER.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/a703a2e6-09a8-451c-a944-31b2897e9012_en?filename=FACTSHEET_EDF_2024_LS_RA_SMERO_NT_101224517_INNCH2PROP.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/3a7173aa-b1b4-42dc-804e-a5bea98e9daf_en?filename=FACTSHEET_EDF_2024_LS_RA_SMERO_NT_101224513_IRONPLAN.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/2bef50c6-7ba9-4f18-938d-074897105f0d_en?filename=FACTSHEET_EDF_2024_LS_RA_SMERO_NT_101224292_LUCID.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/9aa350af-a6cc-40bf-990a-ae5344a8832d_en?filename=FACTSHEET_EDF_2024_LS_RA_SMERO_NT_101224047_PLEIADES.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/eb5bb5b2-4ebd-4ce2-a773-7aabfa498786_en?filename=FACTSHEET_EDF_2024_LS_RA_SMERO_NT_101224064_POINTER.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/c9b28e12-9ee5-4770-9c8d-996be325ef3c_en?filename=FACTSHEET_EDF_2024_LS_RA_SMERO_NT_101224229_QANCOMFIN.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/d83a2a81-0589-4042-ab80-36035a5d3e0b_en?filename=FACTSHEET_EDF_2024_LS_RA_SMERO_NT_101224105_SABER.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/097e186d-2511-4abe-8d1d-fd3799fcf301_en?filename=FACTSHEET_EDF_2024_LS_RA_SMERO_NT_101224140_SENTINEL.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/95f10fe1-05d4-4504-945e-b4f303c0e5bb_en?filename=FACTSHEET_EDF_2024_LS_RA_SMERO_NT_101223931_SPADER.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/c988dd3c-3b62-4606-8647-82f3d711151d_en?filename=FACTSHEET_EDF_2024_DA_SIMTRAIN_STME_STEP_101224363_READYMED_EUROPE.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/98cf7727-5df7-437f-bf91-cb036efebdb4_en?filename=FACTSHEET_EDF_2024_RA_SIMTRAIN_BRG_STEP_101224034_BATTLEVERSE.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/20a428ff-f91b-4984-81c3-c5c0aba97b12_en?filename=FACTSHEET_EDF_2024_DA_SPACE_EPW_STEP_101224684_EDF2024_EPW_Phase2.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/d22322ff-8660-4f0e-a7fc-a75a5cbd0d8a_en?filename=FACTSHEET_EDF_2024_LS_RA_CHALLENGE_SENS_RADNO_101224389_ORDEAL.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/ca96e999-c07c-473e-a23f-8bb42da28e78_en?filename=FACTSHEET_EDF_2024_LS_RA_CHALLENGE_SENS_RADNP_101224702_NAVISENSE_X.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/da70df57-418c-41b5-a331-a409b119ed5c_en?filename=FACTSHEET_EDF_2024_LS_RA_CHALLENGE_SENS_RADNP_101223904_ORIGAMI.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/8034608c-a5b7-4402-8953-8bdd0bef9562_en?filename=FACTSHEET_EDF_2024_LS_RA_CHALLENGE_SENS_RADNP_101224367_SNADE.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/22b8a545-6c55-4e01-b109-f285c85245dc_en?filename=FACTSHEET_EDF_2024_LS_RA_CHALLENGE_SENS_RADNP_101224078_SWARMER.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/f0343f27-b5d1-4ce9-9127-35f8a25e5fce_en?filename=FACTSHEET_EDF_2024_LS_RA_CHALLENGE_SPACE_MSIAO_101224267_MARTINA.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/c0720b05-0e50-44e6-9139-b499c5810af8_en?filename=FACTSHEET_EDF_2024_LS_RA_CHALLENGE_SPACE_MSIAP_101223957_ARGOS.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/91e78490-25fc-4f61-94a8-fa6e3be7459f_en?filename=FACTSHEET_EDF_2024_LS_RA_CHALLENGE_SPACE_MSIAP_101224710_ARGUS.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/8a7b47f0-b755-4754-b1e1-4c52225d4c7e_en?filename=FACTSHEET_EDF_2024_LS_RA_CHALLENGE_SPACE_MSIAP_101224467_MYRIAD.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/f83bdabd-5007-49dc-a51d-c5f6920e9f12_en?filename=FACTSHEET_EDF_2024_DA_UWW_AHMS_101223978_EUROSWEEP.pdf", _EDF_2024_AWARDED),
        (EDF_BASE_URL + "/document/download/b61eff60-1ffa-49a9-87d0-d05fdb9b9df7_en?filename=FACTSHEET_EDF_2024_RA_UWW_SACOM_STEP_101223924_ASTERION.pdf", _EDF_2024_AWARDED),
    ],
    # --- EDF 2025 ---
    "edf_2025": [
        (EDF_BASE_URL + "/document/download/75e43754-64f3-4b6c-88c7-9886fc18e469_en", _EDF_2025_AWARDED),  # RESILIENCE-R-2025 RA
        (EDF_BASE_URL + "/document/download/a7ad745b-662b-4d6c-bb0d-80740fe62527_en", _EDF_2025_AWARDED),  # RESILIENCE-D-25 DA
        (EDF_BASE_URL + "/document/download/46d901f0-5011-4157-b235-3be62519f735_en", _EDF_2025_AWARDED),  # SALUBRIS RA
        (EDF_BASE_URL + "/document/download/7d9a1223-9214-42ce-806e-b2200ca39b14_en", _EDF_2025_AWARDED),  # ANEMOS RA
        (EDF_BASE_URL + "/document/download/685989cd-658d-48e1-a6ef-a945554b248e_en", _EDF_2025_AWARDED),  # SPIRIT DA
        (EDF_BASE_URL + "/document/download/37bfe3da-4f35-450f-bdff-229bdedc3d7b_en", _EDF_2025_AWARDED),  # SHIMBAD DA
        (EDF_BASE_URL + "/document/download/92d2b328-c040-41a2-9f8a-f6acf3da5a7e_en", _EDF_2025_AWARDED),  # ECC2 DA
        (EDF_BASE_URL + "/document/download/3cea0490-a702-4c8f-81fd-a7ec3256b55a_en", _EDF_2025_AWARDED),  # STRATUS RA
        (EDF_BASE_URL + "/document/download/712cd5bf-beb5-4ced-8386-fa84b68f8b3d_en", _EDF_2025_AWARDED),  # ASIMOV DA
        (EDF_BASE_URL + "/document/download/c6838cc9-dc6b-4b66-a028-69ef453e278f_en", _EDF_2025_AWARDED),  # SPIDER2 DA
        (EDF_BASE_URL + "/document/download/c65bd04d-9892-4a42-a996-5df7cca748e7_en", _EDF_2025_AWARDED),  # DIALOG-AI RA
        (EDF_BASE_URL + "/document/download/575cdef2-f951-4550-b303-16c0c5645c40_en", _EDF_2025_AWARDED),  # AI-SHIELD RA
        (EDF_BASE_URL + "/document/download/174a2e88-f09d-4183-ad79-27bf1c3940c0_en", _EDF_2025_AWARDED),  # LLM Secret RA
        (EDF_BASE_URL + "/document/download/f69c20ea-cc20-4bd3-b965-8fae5ae47cdd_en", _EDF_2025_AWARDED),  # MIDAS RA
        (EDF_BASE_URL + "/document/download/335b8017-1887-4dd8-91de-72d629964094_en", _EDF_2025_AWARDED),  # RHESIS RA
        (EDF_BASE_URL + "/document/download/2e44dd94-c5a4-488e-b667-ca0bbdcfd110_en", _EDF_2025_AWARDED),  # MINERVA RA
        (EDF_BASE_URL + "/document/download/4d259b13-17b4-4cea-a08c-c9749f9fa0a4_en", _EDF_2025_AWARDED),  # SHARP RA
        (EDF_BASE_URL + "/document/download/34f76263-5d2f-4389-b565-1090573ae6f8_en", _EDF_2025_AWARDED),  # AETHER DA
        (EDF_BASE_URL + "/document/download/0eb14cfb-6ae1-4b32-b069-7aa21a091872_en", _EDF_2025_AWARDED),  # EURECA RA
        (EDF_BASE_URL + "/document/download/8e47a86f-f4a8-440a-a96b-054c101616c9_en", _EDF_2025_AWARDED),  # EICACS 2 DA
        (EDF_BASE_URL + "/document/download/3a04b04c-5e3f-4fef-a122-7060599ba884_en", _EDF_2025_AWARDED),  # EPIIC2 DA
        (EDF_BASE_URL + "/document/download/2b8899d9-ee74-41a0-becb-bbe00c39f0bc_en", _EDF_2025_AWARDED),  # D-STORM DA
        (EDF_BASE_URL + "/document/download/e361419d-7f53-4d64-9ff8-36acc654297a_en", _EDF_2025_AWARDED),  # EURODAMM DA
        (EDF_BASE_URL + "/document/download/8baa8e6d-4401-4c53-b32c-843cff99afad_en", _EDF_2025_AWARDED),  # LUMINA DA
        (EDF_BASE_URL + "/document/download/87c8ac65-78ce-4434-9b20-314f1ca3e087_en", _EDF_2025_AWARDED),  # SKYRAPTOR DA
        (EDF_BASE_URL + "/document/download/4c5b6405-d0fa-4f9d-8d10-8f939b29c298_en", _EDF_2025_AWARDED),  # TALON DA
        (EDF_BASE_URL + "/document/download/72819edb-5440-42bf-8bd0-c5da9df1094c_en", _EDF_2025_AWARDED),  # FAMOUS3 DA
        (EDF_BASE_URL + "/document/download/8376595a-e80e-4d26-82cc-ad0702146ba6_en", _EDF_2025_AWARDED),  # LATACC2 DA
        (EDF_BASE_URL + "/document/download/5c22ea8f-8079-42eb-bd49-b1a85d0dfd75_en", _EDF_2025_AWARDED),  # TRIDENT RA
        (EDF_BASE_URL + "/document/download/ee618007-4257-4e76-bcc7-b5c0f53154a0_en", _EDF_2025_AWARDED),  # ACHILE2 DA
        (EDF_BASE_URL + "/document/download/90601d01-9fc9-4141-865b-741a80692baa_en", _EDF_2025_AWARDED),  # E-DOMINION DA
        (EDF_BASE_URL + "/document/download/178862ee-14e0-4707-a140-690c4cf3ae54_en", _EDF_2025_AWARDED),  # SHIELD DA
        (EDF_BASE_URL + "/document/download/e3f4ae90-84cc-49c5-a368-0d9a4841db40_en", _EDF_2025_AWARDED),  # SWORD RA
        (EDF_BASE_URL + "/document/download/af747e51-8205-448f-b748-f49446834dd3_en", _EDF_2025_AWARDED),  # DART RA
        (EDF_BASE_URL + "/document/download/af2178b2-0d61-4c77-9e31-20cbb196aa10_en", _EDF_2025_AWARDED),  # EVOLVE RA
        (EDF_BASE_URL + "/document/download/8caf6084-533b-4b92-8c06-ff87ba414788_en", _EDF_2025_AWARDED),  # DEEP-TECH RA
        (EDF_BASE_URL + "/document/download/898292f3-dd5f-4128-adcb-a5eb2c222d44_en", _EDF_2025_AWARDED),  # ABYSSA RA
        (EDF_BASE_URL + "/document/download/8c23dd25-b959-408d-8d1f-a9c3cdb6765c_en", _EDF_2025_AWARDED),  # CoPaNA RA
        (EDF_BASE_URL + "/document/download/9f85d2fe-30b0-4b8f-a3eb-abd6319d0648_en", _EDF_2025_AWARDED),  # NEXTSWIR RA
        (EDF_BASE_URL + "/document/download/7592fe97-dc34-40fb-9fc7-0ae51a5c3096_en", _EDF_2025_AWARDED),  # SOLARES RA
        (EDF_BASE_URL + "/document/download/71744893-d23c-4466-99b0-0eb18bb29c3c_en", _EDF_2025_AWARDED),  # SPECTRE RA
        (EDF_BASE_URL + "/document/download/9e8afaee-4f48-4f43-bcf1-095d5259c8d7_en", _EDF_2025_AWARDED),  # Spin Defender RA
        (EDF_BASE_URL + "/document/download/42c6fa4f-1235-42c0-abc5-359ac0cf560c_en", _EDF_2025_AWARDED),  # FAST TRAIN RA
        (EDF_BASE_URL + "/document/download/fe8fd417-9c33-4197-ac63-93e4fddd222c_en", _EDF_2025_AWARDED),  # AEGIS-NET RA
        (EDF_BASE_URL + "/document/download/2d7e501e-39c3-4473-88f8-f292153f04ec_en", _EDF_2025_AWARDED),  # EM-Mortar RA
        (EDF_BASE_URL + "/document/download/300a3ad2-dd03-4f4d-9639-187fbee10850_en", _EDF_2025_AWARDED),  # MANTIS RA
        (EDF_BASE_URL + "/document/download/d2815315-ce1a-41ec-92f3-09d383bcf402_en", _EDF_2025_AWARDED),  # PRIORITY RA
        (EDF_BASE_URL + "/document/download/4944cccc-e783-45c5-8300-9dd9d2798c7b_en", _EDF_2025_AWARDED),  # R3DSurfin RA
        (EDF_BASE_URL + "/document/download/abd78542-ad56-41f4-8e35-0de59062fbb2_en", _EDF_2025_AWARDED),  # ResistCAM RA
        (EDF_BASE_URL + "/document/download/554d5147-63ed-4ed8-b851-1952710df2a1_en", _EDF_2025_AWARDED),  # TAC RA
        (EDF_BASE_URL + "/document/download/3b14368d-4e96-46cf-ad22-dbfd1d74560e_en", _EDF_2025_AWARDED),  # U-HARRIER RA
        (EDF_BASE_URL + "/document/download/1d94605e-73c7-415e-9d19-bb77bd4327c2_en", _EDF_2025_AWARDED),  # 5G4DEF DA
        (EDF_BASE_URL + "/document/download/3e931535-0850-42dd-89d6-320df5f1b597_en", _EDF_2025_AWARDED),  # EOBLINDING DA
        (EDF_BASE_URL + "/document/download/924dae8c-dc04-4216-a4b3-ab3ad4fbdc30_en", _EDF_2025_AWARDED),  # GNSS_ARMOUR DA
        (EDF_BASE_URL + "/document/download/9cf8bbb9-850c-4d1d-b17a-fd4700b64972_en", _EDF_2025_AWARDED),  # NEVMA DA
        (EDF_BASE_URL + "/document/download/1c937b0b-82e1-4177-9e92-81e54ba70286_en", _EDF_2025_AWARDED),  # RESIST DA
        (EDF_BASE_URL + "/document/download/e5f74276-dcf6-409e-b99b-5b49ffa4101b_en", _EDF_2025_AWARDED),  # SEQULITE DA
        (EDF_BASE_URL + "/document/download/cfc1f493-47cf-4940-a371-af4c8850c81e_en", _EDF_2025_AWARDED),  # SOUND2 DA
        (EDF_BASE_URL + "/document/download/caea2590-7d8b-4d72-9c0c-bb8051e7232e_en", _EDF_2025_AWARDED),  # EOA-V2 CSA
    ],
}

# ---------------------------------------------------------------------------
# Call-year → (source_id, awarded_date) — RA/DA determined from PDF content
# Single source of truth imported by classify.py
# ---------------------------------------------------------------------------

# Populated dynamically after parsing each PDF; here we pre-define the known
# source IDs so classify.py can import EDF_SOURCE_SECTOR before any PDFs are
# parsed.
EDF_SOURCE_SECTOR: dict[str, str] = {
    "edf_ra_2021": "defense",
    "edf_da_2021": "defense",
    "edf_ra_2022": "defense",
    "edf_da_2022": "defense",
    "edf_ra_2023": "defense",
    "edf_da_2023": "defense",
    "edf_ra_2024": "defense",
    "edf_da_2024": "defense",
    "edf_ra_2025": "defense",
    "edf_da_2025": "defense",
}

# ---------------------------------------------------------------------------
# Known EDF coordinator → country overrides (multi-country corporates / orgs
# whose country is unambiguous but name-matching alone is insufficient).
# Same pattern as _KNOWN_ORG_COUNTRIES in extract_chips_ju.py.
# ---------------------------------------------------------------------------

_KNOWN_EDF_ORG_COUNTRIES: dict[str, str] = {
    k.upper(): v for k, v in {
        "THALES SIX GTS FRANCE SAS": "FR",
        "THALES DMS FRANCE SAS": "FR",
        "THALES ESPANA SISTEMAS SA": "ES",
        "THALES ITALY SPA": "IT",
        "LEONARDO": "IT",
        "LEONARDO SPA": "IT",
        "LEONARDO S.P.A.": "IT",
        "INDRA SISTEMAS SA": "ES",
        "AIRBUS DEFENCE AND SPACE GMBH": "DE",
        "AIRBUS DEFENCE AND SPACE SAS": "FR",
        "AIRBUS DEFENCE AND SPACE SA": "ES",
        "AIRBUS DS GMBH": "DE",
        "MBDA DEUTSCHLAND GMBH": "DE",
        "MBDA FRANCE SAS": "FR",
        "MBDA ITALIA SPA": "IT",
        "MBDA UK LIMITED": "GB",
        "SAAB AKTIEBOLAG": "SE",
        "SAAB AB": "SE",
        "RHEINMETALL ELECTRONICS GMBH": "DE",
        "RHEINMETALL ELECTRNONICS GMBH": "DE",
        "RHEINMETALL LANDSYSTEME GMBH": "DE",
        "NAVAL GROUP": "FR",
        "NAVANTIA SA": "ES",
        "NAVANTIA S.A.": "ES",
        "HENSOLDT SENSORS GMBH": "DE",
        "PATRIA AVIATION OY": "FI",
        "PATRIA OY": "FI",
        "DIEHL DEFENCE GMBH & CO KG": "DE",
        "DIEHL DEFENCE GMBH": "DE",
        "KONGSBERG GRUPPEN ASA": "NO",
        "KONGSBERG DEFENCE & AEROSPACE AS": "NO",
        "BAE SYSTEMS PLC": "GB",
        "BAE SYSTEMS (OPERATIONS) LIMITED": "GB",
        "ELETTRONICA SPA": "IT",
        "GMV AEROSPACE AND DEFENCE SAU": "ES",
        "GMV AEROSPACE AND DEFENCE, S.A.U": "ES",
        "PGZ SA": "PL",
    }.items()
}

# ISO-2 country name patterns for coordinator name derivation
_EDF_EXPLICIT_COUNTRY_MARKERS: list[tuple[str, str]] = [
    (r"\bAUSTRIA\b|\bOESTERREICH\b|\bÖSTERREICH\b", "AT"),
    (r"\bGERMANY\b|\bDEUTSCHLAND\b", "DE"),
    (r"\bFRANCE\b|\bFRANCAIS\b|\bFRANÇAIS\b", "FR"),
    (r"\bITALIA\b|\bITALY\b|\bITALIAN\b", "IT"),
    (r"\bNEDERLAND\b|\bNETHERLANDS?\b", "NL"),
    (r"\bBELGIQUE\b|\bBELGIE\b|\bBELGIUM\b", "BE"),
    (r"\bESPANA\b|\bESPAÑA\b|\bSPAIN\b|\bSPANISH\b", "ES"),
    (r"\bSWEDEN\b|\bSVERIGE\b", "SE"),
    (r"\bNORWAY\b|\bNORGE\b", "NO"),
    (r"\bDENMARK\b|\bDANMARK\b", "DK"),
    (r"\bFINLAND\b|\bSUOMI\b", "FI"),
    (r"\bPOLAND\b|\bPOLSKA\b", "PL"),
    (r"\bPORTUGAL\b", "PT"),
    (r"\bGREECE\b|\bHELLENIC\b|\bHELLAS\b", "GR"),
    (r"\bIRELAND\b", "IE"),
    (r"\bCZECH\b|\bCESKA\b|\bČESKÁ\b", "CZ"),
    (r"\bROMANIA\b|\bROMANIE\b", "RO"),
    (r"\bBULGARIA\b|\bBULGARIAN\b", "BG"),
    (r"\bCROATIA\b|\bHRVATSKA\b", "HR"),
    (r"\bESTONIA\b|\bEESTI\b", "EE"),
    (r"\bLATVIA\b|\bLATVIJA\b", "LV"),
    (r"\bLITHUANIA\b|\bLIETUVA\b", "LT"),
    (r"\bSLOVAKIA\b|\bSLOVENSKO\b", "SK"),
    (r"\bSLOVENIA\b|\bSLOVENIJA\b", "SI"),
    (r"\bSWISS\b|\bSCHWEIZ\b|\bSUISSE\b", "CH"),
    (r"\bNORWEGIAN\b", "NO"),
]

_EDF_LANGUAGE_PATTERNS: list[tuple[str, str]] = [
    (r"\bPOLITECNICO\b|\bUNIVERSITA\b|\bUNIVERSITÀ\b|\bCONSORZIO\b", "IT"),
    (r"\bLULE[ÅA] TEKNISKA\b|\bKUNGLIGA\b", "SE"),
    (r"\bCOMMISSARIAT\b|\bUNIVERSITE\b|\bUNIVERSITÉ\b|\bCNRS\b", "FR"),
    (r"\bPOLITECHNIKA\b|\bUNIWERSYTET\b", "PL"),
    (r"\bUNIVERSIDAD\b|\bFUNDACION\b|\bFUNDACIÓN\b", "ES"),
    (r"\bFRAUNHOFER\b|\bHELMHOLTZ\b|\bMAX[- ]PLANCK\b", "DE"),
    (r"\bINTERUNIVERSITAIR MICRO|\bIMEC\b", "BE"),
    (r"\bTECNICO LISBOA\b|\bFUNDACAO\b|\bFUNDAÇÃO\b", "PT"),
]


def _derive_country_from_name(name: str) -> str | None:
    """Best-effort ISO2 country from coordinator institution name."""
    name_upper = name.upper()
    if name_upper in _KNOWN_EDF_ORG_COUNTRIES:
        return _KNOWN_EDF_ORG_COUNTRIES[name_upper]
    for pattern, iso in _EDF_EXPLICIT_COUNTRY_MARKERS:
        if re.search(pattern, name_upper):
            return iso
    for pattern, iso in _EDF_LANGUAGE_PATTERNS:
        if re.search(pattern, name_upper):
            return iso
    return None


# ---------------------------------------------------------------------------
# Name normalisation (same as extract_chips_ju.py)
# ---------------------------------------------------------------------------

_NORM_LEGAL_RE = re.compile(
    r"\b(?:GmbH|gGmbH|mbH|AG|KG|UG|GesmbH|"
    r"BV|NV|"
    r"SAS|SARL|SASU|SCA|"
    r"SRL|S\.r\.l\.|SpA|S\.p\.A\.|Srls|SCPA|"
    r"SRO|s\.r\.o\.|"
    r"SL|SLU|SLL|SLNE|SAU|"
    r"Ltd|Limited|PLC|LLC|LLP|Inc|Corp|"
    r"AB|ApS|AS|"
    r"Oy|Oyj|hf|ehf|"
    r"DOO|d\.o\.o\.|DD|UAB|OOO|"
    r"Lda|CRL|Scrl|"
    r"EE|IKE|"
    r"Zrt|Kft|Nyrt|"
    r"SE|SA)\b",
    re.IGNORECASE,
)
_NORM_PUNCT_RE = re.compile(r"[,.\-_/\\&]+")
_NORM_PAREN_RE = re.compile(r"\([^)]*\)")
_NORM_WS_RE = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    s = _NORM_PAREN_RE.sub(" ", s)
    s = _NORM_LEGAL_RE.sub("", s)
    s = _NORM_PUNCT_RE.sub(" ", s)
    return _NORM_WS_RE.sub(" ", s).strip().lower()


# ---------------------------------------------------------------------------
# PDF download and caching
# ---------------------------------------------------------------------------

def _pdf_cache_path(url: str) -> Path:
    """Derive a stable filename from the URL for local caching."""
    # Use the UUID-like segment before "_en" as the stem
    m = re.search(r"/([0-9a-f\-]{30,}(?:_en)?)", url)
    stem = m.group(1).replace("/", "_") if m else url[-40:].replace("/", "_")
    return RAW_DIR / f"{stem}.pdf"


def _is_real_pdf(path: Path) -> bool:
    """A real factsheet PDF starts with %PDF-; rate-limit Sorry pages are HTML."""
    if not path.exists() or path.stat().st_size < 5000:
        return False
    try:
        with path.open("rb") as f:
            return f.read(5) == b"%PDF-"
    except OSError:
        return False


def fetch_pdf(url: str, force_refresh: bool = False, sleep_seconds: float = 0.0) -> Path | None:
    """Download a factsheet PDF via curl (macOS SSL workaround). Returns path.

    On-disk cache is treated as valid only if the file starts with %PDF- magic
    bytes — this auto-invalidates the ~40KB HTML 'Sorry' pages that the EC
    server returns under rate-limiting. Pass sleep_seconds to pace re-runs.
    """
    path = _pdf_cache_path(url)
    if not force_refresh and _is_real_pdf(path):
        return path
    result = subprocess.run(
        ["curl", "-sL", "-H", "User-Agent: Mozilla/5.0", url],
        capture_output=True, timeout=30,
    )
    if sleep_seconds > 0:
        time.sleep(sleep_seconds)
    if result.returncode != 0 or len(result.stdout) < 5000:
        return None
    path.write_bytes(result.stdout)
    if not _is_real_pdf(path):
        # Got a Sorry page (HTML masquerading as PDF) — leave file in place so
        # we don't re-hit on next non-refresh run, but report as download failure.
        return None
    return path


# ---------------------------------------------------------------------------
# PDF parsing
# ---------------------------------------------------------------------------

# Patterns to find key fields on page 1.
# PDFs concatenate labels without spaces: CALLTITLE:, TOPICTITLE:,
# TYPE(S) OFACTIVITIES:, ESTIMATED TOTALCOST: — \s* handles both forms.
_CALL_TITLE_RE = re.compile(
    r"CALL\s*TITLE\s*[:\-]?\s*\n?(.*?)(?=TOPIC\s*TITLE|DURATION|TYPE|ESTIMATED|$)",
    re.IGNORECASE | re.DOTALL,
)
_TOPIC_RE = re.compile(
    r"TOPIC\s*TITLE\s*[:\-]?\s*\n?(.*?)(?=DURATION|TYPE|ESTIMATED|$)",
    re.IGNORECASE | re.DOTALL,
)
_ACTIVITIES_RE = re.compile(
    r"TYPE\s*\(S\)?\s*OF\s*ACTIVITIES\s*[:\-]?\s*\n?(.*?)(?=ESTIMATED|MAXIMUM|$)",
    re.IGNORECASE | re.DOTALL,
)
_TOTAL_COST_RE = re.compile(
    r"ESTIMATED\s+TOTAL\s*COST\s*[:\-]?\s*€?\s*([\d\s,\.]+)",
    re.IGNORECASE,
)
_EU_CONTRIB_RE = re.compile(
    r"MAXIMUM\s+EU\s+CONTRIBUTION\s*[:\-]?\s*€?\s*([\d\s,\.]+)",
    re.IGNORECASE,
)
# Coordinator marker: "NAME (Coordinator) COUNTRY" — country may be on same line or next line
_COORD_LINE_RE = re.compile(r"^(.*?)\s*\(Coordinator\)\s*(.*?)\s*$", re.IGNORECASE | re.MULTILINE)


def _parse_eur(text: str) -> float | None:
    """Parse '40,000,000.00' or '40 000 000.00' to float."""
    if not text:
        return None
    cleaned = re.sub(r"[^\d.]", "", text.replace(",", ".").replace(" ", ""))
    # Handle ambiguous "40.000.000" (European thousands-separator)
    parts = cleaned.split(".")
    if len(parts) > 2:
        cleaned = "".join(parts[:-1]) + "." + parts[-1]
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def _determine_action_type_from_pdf(call_title: str, activities: str) -> str:
    """Return 'ra' or 'da' based on PDF text.

    EDF 2022–2025: call title says 'Research actions' or 'Development actions'.
    EDF 2021: call title is a capability area (e.g. 'Avionics and advanced air
    combat'). Infer from activity types: 'Generating knowledge' or 'Integrating
    knowledge' → RA; 'Prototyping' / 'Testing' without knowledge-generation → DA;
    plain 'Studies' / 'Studies; Design' defaults to DA.
    """
    ct_low = call_title.lower()
    if "research action" in ct_low:
        return "ra"
    if "development action" in ct_low:
        return "da"
    # EDF 2021 fallback: activity-type heuristic
    act_low = activities.lower()
    if "generating knowledge" in act_low or "integrating knowledge" in act_low:
        return "ra"
    if "research" in act_low:
        return "ra"
    return "da"


def parse_factsheet_pdf(pdf_path: Path) -> dict | None:
    """Extract coordinator, country, amounts and metadata from one factsheet PDF."""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            if not pdf.pages:
                return None

            # --- Page 1: project metadata ---
            p1_text = pdf.pages[0].extract_text() or ""

            # Extract project acronym — first non-header, non-label line.
            # Some PDFs have decorative header lines (EUROPEAN, DEFENCE, FUND,
            # UNION) before the acronym; field labels end with ":".
            _EDF_SKIP_WORDS = {
                "EUROPEAN", "DEFENCE", "DEFENSE", "FUND", "UNION", "SELECTED",
                "PROJECTS", "EDF",
            }
            lines = [ln.strip() for ln in p1_text.splitlines() if ln.strip()]
            acronym = ""
            title = ""
            for i, ln in enumerate(lines[:12]):
                if ln.endswith(":"):
                    break  # reached field labels
                words = ln.split()
                if not words:
                    continue
                if all(w.upper() in _EDF_SKIP_WORDS or w.upper() == w and len(w) <= 4 for w in words):
                    continue  # decorative header
                # This line is the acronym
                acronym = ln[:40]
                if i + 1 < len(lines) and not lines[i + 1].endswith(":"):
                    title = lines[i + 1]
                break
            if not acronym:
                acronym = lines[0][:40] if lines else ""
                title = lines[1] if len(lines) > 1 else ""

            m = _CALL_TITLE_RE.search(p1_text)
            call_title = m.group(1).strip() if m else ""

            m = _TOPIC_RE.search(p1_text)
            topic = m.group(1).strip() if m else ""

            m = _ACTIVITIES_RE.search(p1_text)
            activities = m.group(1).strip() if m else ""

            m = _TOTAL_COST_RE.search(p1_text)
            total_cost = _parse_eur(m.group(1)) if m else None

            m = _EU_CONTRIB_RE.search(p1_text)
            eu_contribution = _parse_eur(m.group(1)) if m else None

            action_type = _determine_action_type_from_pdf(call_title, activities)

            # --- Pages 2+: coordinator (word-position approach) ---
            # EDF factsheets use a two-column table: company name (left) and
            # country (right, x > ~420). Company names often wrap across
            # multiple lines. "(Coordinator)" may appear:
            #   a) on the same line as the name: "NAME (Coordinator) Country"
            #   b) on a separate line directly below the name (REACTS pattern)
            #   c) inline after the last segment of a multi-line name
            # Strategy: find the "(Coordinator)" word, collect left-column
            # words within 45px above it as the name, pick the right-column
            # word in the same y-window as the country.
            _TABLE_HEADER_WORDS = {
                "NAME", "COUNTRY", "OF", "THE", "ENTITY", "THEENTITY",
                "MEMBERS", "CONSORTIUM", "ESTABLISHMENT", "AND",
            }
            coordinator_name = ""
            coordinator_country = ""
            for page in pdf.pages[1:]:
                words = page.extract_words()
                # pdfplumber sometimes fuses the last name token with
                # "(Coordinator)": e.g. "FRANCE(Coordinator)", "AS(Coordinator)"
                coord_word = next(
                    (w for w in words if "(coordinator)" in w["text"].lower()), None
                )
                if not coord_word:
                    continue
                cy = coord_word["top"]
                pw = page.width  # 595 for A4
                right_threshold = pw * 0.65  # country column starts around x=420

                # If the coord_word has a name prefix fused in, extract it
                coord_text = coord_word["text"]
                paren_pos = coord_text.lower().find("(coordinator)")
                fused_prefix = coord_text[:paren_pos].strip() if paren_pos > 0 else ""

                # Collect words within 45px above (and same line as) coordinator
                name_words: list[tuple[float, float, str]] = []  # (y, x, text)
                country_candidates: list[tuple[float, str]] = []  # (y_dist, text)
                for w in words:
                    wy = w["top"]
                    wx = w["x0"]
                    if w is coord_word:
                        continue
                    if not (cy - 45 <= wy <= cy + 3):
                        continue
                    if w["text"].upper() in _TABLE_HEADER_WORDS:
                        continue
                    if wx >= right_threshold:
                        country_candidates.append((abs(wy - cy), w["text"]))
                    else:
                        name_words.append((wy, wx, w["text"]))

                if not name_words and not fused_prefix:
                    continue

                # Sort by (y, x) to reconstruct reading order
                name_words.sort(key=lambda t: (t[0], t[1]))
                # Group into lines by y-proximity (within 3px = same line)
                lines_grouped: list[list[str]] = []
                cur_y: float | None = None
                cur_line: list[str] = []
                for wy, _wx, wtext in name_words:
                    if cur_y is None or abs(wy - cur_y) > 3:
                        if cur_line:
                            lines_grouped.append(cur_line)
                        cur_line = [wtext]
                        cur_y = wy
                    else:
                        cur_line.append(wtext)
                if cur_line:
                    lines_grouped.append(cur_line)

                name_from_words = " ".join(" ".join(ln) for ln in lines_grouped)
                if fused_prefix:
                    coordinator_name = (name_from_words + " " + fused_prefix).strip()
                else:
                    coordinator_name = name_from_words

                # Country: closest right-column word to coordinator y
                if country_candidates:
                    country_candidates.sort(key=lambda t: t[0])
                    coordinator_country = country_candidates[0][1]

                break

            # Fallback: derive country from name
            if not coordinator_country and coordinator_name:
                derived = _derive_country_from_name(coordinator_name)
                if derived:
                    coordinator_country = derived

            if not coordinator_name:
                return None

            return {
                "acronym": acronym,
                "title": title,
                "call_title": call_title,
                "topic": topic,
                "activities": activities,
                "action_type": action_type,
                "total_cost_eur": total_cost,
                "eu_contribution_eur": eu_contribution,
                "coordinator_name": coordinator_name,
                "coordinator_country_raw": coordinator_country,
            }

    except Exception as e:
        print(f"  WARN: parse error on {pdf_path.name}: {e}")
        return None


# ---------------------------------------------------------------------------
# Country name → ISO2
# ---------------------------------------------------------------------------

# Moved to ETL/lib/europe_scope.py. Eight modules each carried a version of
# this map in a different casing, so a case-sensitive lookup silently failed
# depending on which copy a feed hit, and an unresolvable name writes a NULL
# country rather than raising. The canonical map is casefolded and is the
# union of every alias any source needed (72 names, incl. native forms).
_COUNTRY_NAME_TO_ISO2 = COUNTRY_NAME_TO_ISO2

def _country_to_iso2(raw: str) -> str:
    """Convert country name string to ISO2 code."""
    if not raw:
        return ""
    stripped = raw.strip().rstrip(".")
    if len(stripped) == 2 and stripped.isalpha():
        return stripped.upper()
    return name_to_iso2(stripped) or (stripped[:2].upper() if len(stripped) >= 2 else "")


# ---------------------------------------------------------------------------
# Main extraction
# ---------------------------------------------------------------------------

def extract_all(force_refresh: bool = False, sleep_seconds: float = 0.0) -> list[dict]:
    """Download and parse all EDF factsheets, return list of coordinator rows."""
    rows: list[dict] = []
    failed: list[str] = []

    for call_year_key, url_list in EDF_FACTSHEET_URLS.items():
        year_str = call_year_key.split("_")[1]  # "2021", "2022", etc.
        year = int(year_str)
        print(f"\nProcessing {call_year_key} ({len(url_list)} factsheets) ...")

        for url, awarded_date in url_list:
            pdf_path = fetch_pdf(url, force_refresh=force_refresh, sleep_seconds=sleep_seconds)
            if pdf_path is None:
                print(f"  WARN: failed to download {url[:80]}")
                failed.append(url)
                continue

            parsed = parse_factsheet_pdf(pdf_path)
            if parsed is None:
                print(f"  WARN: could not parse {pdf_path.name}")
                failed.append(url)
                continue

            action_type = parsed["action_type"]  # "ra" or "da"
            source_id = f"edf_{action_type}_{year}"
            country_iso2 = _country_to_iso2(parsed["coordinator_country_raw"])

            acronym = parsed["acronym"][:40]
            call_id = f"{source_id}_{re.sub(r'[^a-z0-9]', '_', acronym.lower())}"

            # Capability area: prefer topic, fall back to call_title
            capability_area = parsed["topic"] or parsed["call_title"]
            capability_area = re.sub(r"\s+", " ", capability_area).strip()[:80]

            sector_parts = ["Defense"]
            if capability_area and capability_area.lower() not in ("", "research actions", "development actions"):
                sector_parts.append(capability_area)
            sector_tags_raw = ", ".join(sector_parts)

            rows.append({
                "source": source_id,
                "call_id": call_id,
                "project_acronym": acronym,
                "project_title": parsed["title"][:300],
                "coordinator_name": parsed["coordinator_name"],
                "coordinator_country_raw": parsed["coordinator_country_raw"],
                "country": country_iso2,
                "call_title": parsed["call_title"][:100],
                "topic": parsed["topic"][:100],
                "activities": parsed["activities"][:200],
                "action_type": action_type,
                "eu_contribution_eur": parsed["eu_contribution_eur"],
                "total_cost_eur": parsed["total_cost_eur"],
                "awarded_date": awarded_date,
                "doc_url": url,
                "sector_tags_raw": sector_tags_raw,
            })

    if failed:
        print(f"\nTotal failed downloads/parses: {len(failed)}")

    # Deduplicate by call_id (keep first occurrence)
    seen: set[str] = set()
    deduped = []
    for r in rows:
        if r["call_id"] not in seen:
            seen.add(r["call_id"])
            deduped.append(r)

    print(f"\nExtracted {len(deduped)} coordinator rows ({len(rows) - len(deduped)} dupes dropped)")
    return deduped


# ---------------------------------------------------------------------------
# Company matching (mirrors extract_chips_ju.py — exact / prefix / fuzzy)
# ---------------------------------------------------------------------------

_FUZZY_THRESHOLD = 0.92

MATCH_FIELDNAMES = [
    "source", "call_id", "published_name", "country", "matched_company_id",
    "matched_canonical_name", "match_method", "match_confidence", "fuzzy_score",
]


def match_companies(
    rows: list[dict], conn: sqlite3.Connection
) -> tuple[list[dict], list[dict]]:
    cur = conn.cursor()
    cur.execute("SELECT id, canonical_name, country FROM companies")
    existing: dict[tuple[str, str], tuple[int, str]] = {}
    by_name_only: dict[str, list[tuple[str, int, str]]] = {}
    existing_list: list[tuple[str, str, int, str]] = []
    for row_id, cname, cntry in cur.fetchall():
        norm = normalize_name(cname)
        cntry_up = (cntry or "").upper()
        existing[(norm, cntry_up)] = (row_id, cname)
        existing_list.append((norm, cntry_up, row_id, cname))
        by_name_only.setdefault(norm, []).append((cntry_up, row_id, cname))

    enriched: list[dict] = []
    summary: list[dict] = []

    for r in rows:
        raw_name = r["coordinator_name"]
        country = (r["country"] or "").upper()

        if not raw_name:
            raw_name = r["project_acronym"]

        norm = normalize_name(raw_name)
        company_id: int | None = None
        match_method = "none"
        match_confidence = "unmatched"
        matched_canonical = ""
        fuzzy_score: float | None = None

        # 1. Exact match (normalised name + country)
        exact_key = (norm, country)
        if country and exact_key in existing:
            company_id, matched_canonical = existing[exact_key]
            match_method = "exact"
            match_confidence = "high"

        # 2. Exact name-only (when country derivation failed)
        if company_id is None and norm in by_name_only and not country:
            cands = by_name_only[norm]
            if cands:
                ex_country, ex_id, ex_cname = cands[0]
                company_id = ex_id
                matched_canonical = ex_cname
                match_method = "exact_name_only"
                match_confidence = "medium"
                country = ex_country
                r = {**r, "country": country}

        # 3. Prefix match — bridges "INDRA" (IPCEI) vs "INDRA SISTEMAS SA" (EDF)
        if company_id is None and norm and country:
            best_len = 0
            best_id = None
            best_cname = ""
            for ex_norm, ex_country, ex_id, ex_cname in existing_list:
                if ex_country != country or len(ex_norm) < 4:
                    continue
                if norm.startswith(ex_norm + " ") or ex_norm.startswith(norm + " "):
                    candidate_len = len(ex_norm) if norm.startswith(ex_norm + " ") else len(norm)
                    if candidate_len > best_len:
                        best_len = candidate_len
                        best_id = ex_id
                        best_cname = ex_cname
            if best_id is not None:
                company_id = best_id
                matched_canonical = best_cname
                match_method = "prefix"
                match_confidence = "medium"

        # 4. Fuzzy match (same country, ≥ threshold)
        if company_id is None and norm and country:
            best_ratio = 0.0
            best_id = None
            best_cname = ""
            for ex_norm, ex_country, ex_id, ex_cname in existing_list:
                if ex_country != country:
                    continue
                ratio = SequenceMatcher(None, norm, ex_norm).ratio()
                if ratio >= _FUZZY_THRESHOLD and ratio > best_ratio:
                    best_ratio = ratio
                    best_id = ex_id
                    best_cname = ex_cname
            if best_id is not None:
                company_id = best_id
                matched_canonical = best_cname
                match_method = "fuzzy"
                match_confidence = "medium"
                fuzzy_score = round(best_ratio, 4)

        # 5. No match → insert new company
        if company_id is None:
            cur.execute(
                """INSERT INTO companies
                   (canonical_name, raw_name, country, entity_type, sector_inferred,
                    match_confidence, match_method)
                   VALUES (?, ?, ?, 'unknown', 'defense', 'unmatched', 'none')""",
                (raw_name, raw_name, country or None),
            )
            company_id = cur.lastrowid
            matched_canonical = raw_name
            match_method = "none"
            match_confidence = "unmatched"

            new_norm = normalize_name(raw_name)
            existing[(new_norm, country)] = (company_id, raw_name)
            existing_list.append((new_norm, country, company_id, raw_name))
            by_name_only.setdefault(new_norm, []).append((country, company_id, raw_name))

        enriched.append({**r, "company_id": company_id})
        summary.append({
            "source": r["source"],
            "call_id": r["call_id"],
            "published_name": raw_name,
            "country": country,
            "matched_company_id": company_id,
            "matched_canonical_name": matched_canonical,
            "match_method": match_method,
            "match_confidence": match_confidence,
            "fuzzy_score": fuzzy_score,
        })

    conn.commit()
    return enriched, summary


# ---------------------------------------------------------------------------
# Event loading
# ---------------------------------------------------------------------------

def load_events(rows: list[dict], conn: sqlite3.Connection) -> int:
    cur = conn.cursor()
    inserted = 0
    skipped_dup = 0

    for r in rows:
        company_id = r.get("company_id")
        if company_id is None:
            continue

        cur.execute(
            "SELECT 1 FROM public_funding_events WHERE source=? AND call_id=?",
            (r["source"], r["call_id"]),
        )
        if cur.fetchone():
            skipped_dup += 1
            continue

        grant_eur = r.get("eu_contribution_eur")
        if grant_eur is not None:
            try:
                grant_eur = float(grant_eur)
            except (ValueError, TypeError):
                grant_eur = None

        cur.execute(
            """INSERT INTO public_funding_events
               (company_id, source, role, call_id,
                project_acronym, project_title, project_summary,
                project_started,
                grant_amount_eur,
                sector_tags_raw,
                raw_source_url,
                coordinator_only, grant_amount_basis)
               VALUES (?, ?, 'direct', ?, ?, ?, ?, ?, ?, ?, ?, 1, 'edf_eu_ceiling')""",
            (
                company_id,
                r["source"],
                r["call_id"],
                r["project_acronym"],
                r["project_title"],
                r.get("topic", ""),
                r["awarded_date"],
                grant_eur,
                r.get("sector_tags_raw", "Defense"),
                r.get("doc_url", ""),
            ),
        )
        inserted += 1

    conn.commit()
    if skipped_dup:
        print(f"  Skipped {skipped_dup} duplicate (source, call_id) pairs")
    return inserted


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

CSV_FIELDNAMES = [
    "source", "call_id", "project_acronym", "project_title", "coordinator_name",
    "coordinator_country_raw", "country", "call_title", "topic", "activities",
    "action_type", "eu_contribution_eur", "total_cost_eur", "awarded_date",
    "doc_url", "sector_tags_raw",
]


def main() -> None:
    argv = sys.argv[1:]
    args = set(argv)
    load_db = "--load-db" in args
    refresh = "--refresh" in args
    # --sleep N   pause N seconds between download attempts (helps with rate-limiting)
    sleep_seconds = 0.0
    for a in argv:
        if a.startswith("--sleep="):
            try:
                sleep_seconds = float(a.split("=", 1)[1])
            except ValueError:
                pass

    print(f"Fetching EDF factsheet PDFs (refresh={refresh}, sleep={sleep_seconds}s) ...")
    all_rows = extract_all(force_refresh=refresh, sleep_seconds=sleep_seconds)

    # Per-source summary
    source_counts: dict[str, int] = defaultdict(int)
    source_grant: dict[str, float] = defaultdict(float)
    source_null_amount: dict[str, int] = defaultdict(int)
    source_null_country: dict[str, int] = defaultdict(int)
    for r in all_rows:
        source_counts[r["source"]] += 1
        if r["eu_contribution_eur"]:
            source_grant[r["source"]] += r["eu_contribution_eur"]
        else:
            source_null_amount[r["source"]] += 1
        if not r["country"]:
            source_null_country[r["source"]] += 1

    print("\nPer-source summary:")
    for src in sorted(source_counts):
        n = source_counts[src]
        total_m = source_grant[src] / 1e6
        null_a = source_null_amount[src]
        null_c = source_null_country[src]
        print(f"  {src:<22}  {n:>3} events  €{total_m:>7,.1f}M  "
              f"null_amt={null_a}  null_country={null_c}")

    total = len(all_rows)
    no_country = sum(1 for r in all_rows if not r["country"])
    no_amt = sum(1 for r in all_rows if not r["eu_contribution_eur"])
    print(f"\nTotal: {total} rows  |  no country: {no_country}  |  no amount: {no_amt}")

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        w.writeheader()
        w.writerows(all_rows)
    print(f"\nCSV → {CSV_PATH}")

    if not load_db:
        print("(CSV only — pass --load-db to match and load into db.sqlite)")
        print("Reminder: run python3 classify.py after --load-db")
        return

    if not DB_PATH.exists():
        print(f"!! DB not found: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    print(f"\nMatching {len(all_rows)} rows against {DB_PATH.name} ...")
    enriched, summary = match_companies(all_rows, conn)

    with MATCH_CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        w2 = csv.DictWriter(f, fieldnames=MATCH_FIELDNAMES)
        w2.writeheader()
        w2.writerows(summary)

    method_counts: dict[str, int] = defaultdict(int)
    for s in summary:
        method_counts[s["match_method"]] += 1
    print("Match results:")
    for method, count in sorted(method_counts.items()):
        print(f"  {method:<20}  {count:>4}")
    print(f"  Match summary → {MATCH_CSV_PATH}")

    inserted = load_events(enriched, conn)
    conn.close()
    print(f"\nInserted {inserted} events into public_funding_events")
    print("\nnext: run python3 classify.py")


if __name__ == "__main__":
    main()
