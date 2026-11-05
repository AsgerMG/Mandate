"""Shared helpers for the website build layer: palette, formatters, JSON export.
(Originally the Sprint 9 EDA helpers.) Database access is ETL/lib/store.py's,
never this file's."""
import decimal
import json
import math
from pathlib import Path

# ── Sector palette (7 labels → hex) ────────────────────────────────────────
SECTOR_PALETTE = {
    "life_sciences":     "#7B3F61",
    "cleantech":         "#2D6A4F",
    "deeptech_hardware": "#1F3A93",
    "defense":           "#5C2A2A",
    "digital":           "#D97706",
    "space":             "#1B263B",
    "other":             "#6B7280",
}

# Tremor colour names (mapped in order to sectors for chart props)
SECTOR_TREMOR_COLORS = {
    "life_sciences":     "fuchsia",
    "cleantech":         "emerald",
    "deeptech_hardware": "indigo",
    "defense":           "rose",
    "digital":           "amber",
    "space":             "slate",
    "other":             "gray",
}

# ── Country → region map ────────────────────────────────────────────────────
COUNTRY_REGION_MAP = {
    "SE": "Nordics", "FI": "Nordics", "DK": "Nordics", "NO": "Nordics", "IS": "Nordics",
    "DE": "DACH", "AT": "DACH", "CH": "DACH",
    "ES": "Iberia", "PT": "Iberia",
    "FR": "France",
    "IT": "Italy",
    "BE": "Benelux", "NL": "Benelux", "LU": "Benelux",
    "PL": "CEE", "CZ": "CEE", "SK": "CEE", "HU": "CEE", "RO": "CEE",
    "BG": "CEE", "HR": "CEE", "SI": "CEE", "EE": "CEE", "LV": "CEE", "LT": "CEE",
    "GR": "Greece+Cyprus", "EL": "Greece+Cyprus", "CY": "Greece+Cyprus",
    "GB": "UK+Ireland", "UK": "UK+Ireland", "IE": "UK+Ireland",
    "MT": "Other-EU", "XK": "Other-EU",
    "IL": "Non-EU", "TR": "Non-EU", "RS": "Non-EU", "UA": "Non-EU",
}

# ── Population for per-capita analysis (Eurostat 2024 estimates, millions) ──
COUNTRY_POPULATION_M = {
    "DE": 84.4, "FR": 68.4, "IT": 59.1, "ES": 48.6, "PL": 36.8,
    "RO": 18.9, "NL": 17.9, "BE": 11.7, "SE": 10.5, "CZ": 10.9,
    "PT": 10.3, "HU": 9.7,  "AT": 9.1,  "CH": 8.8,  "BG": 6.2,
    "DK": 5.9,  "FI": 5.6,  "SK": 5.5,  "NO": 5.5,  "IL": 9.9,
    "IE": 5.3,  "HR": 3.9,  "LT": 2.8,  "SI": 2.1,  "LV": 1.8,
    "EE": 1.4,  "CY": 1.3,  "LU": 0.7,  "MT": 0.5,  "IS": 0.4,
    "GR": 10.4, "EL": 10.4, "GB": 67.7, "UK": 67.7,
}


# ── Formatters ──────────────────────────────────────────────────────────────
def _half_up(value: float, places: int) -> str:
    """Format to `places` decimals, rounding ties AWAY FROM ZERO.

    Not cosmetic, and not Python's default. `f"{x:.0f}"` rounds ties to EVEN
    (2.5 → '2', 3.5 → '4'), which is a statistical convention nobody here
    chose; JavaScript's `toFixed` rounds ties away from zero (2.5 → '3',
    -2.5 → '-3'). Both format the SAME corpus:

        synthesis.py    bakes totalCapitalEur into the committed artifact
        corpusFigures.ts  derives it from the census at render time

    so on any value landing exactly on a tie the identical corpus read €2K from
    one path and €3K from the other, and the difference looked like the money
    moved. 5,707 of the 637,940 numbers in the committed data sit on such a tie.

    `Decimal(float)` is the exact binary value the double holds — the same one
    `toFixed` inspects — so this agrees with JavaScript everywhere, not just on
    ties. `ETL/schema/check_cross_language_constants.py` asserts it by running
    both halves.
    """
    quantum = decimal.Decimal(1).scaleb(-places)
    d = decimal.Decimal(value).quantize(quantum, rounding=decimal.ROUND_HALF_UP)
    return f"{d:.{places}f}"


def fmt_eur(value) -> str:
    """Humanise EUR amounts: 1_400_000 → '€1.4M'."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "N/A"
    value = float(value)
    if math.isinf(value):
        return "N/A"
    if abs(value) >= 1e9:
        return f"€{_half_up(value/1e9, 1)}B"
    if abs(value) >= 1e6:
        return f"€{_half_up(value/1e6, 1)}M"
    if abs(value) >= 1e3:
        return f"€{_half_up(value/1e3, 0)}K"
    return f"€{_half_up(value, 0)}"


def fmt_pct(value) -> str:
    """Format as percentage string: 0.471 → '47.1%'."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "N/A"
    return f"{float(value)*100:.1f}%"


def fmt_int(value) -> str:
    """Format integer with thousands separator."""
    if value is None:
        return "N/A"
    return f"{int(value):,}"


# ── JSON export ─────────────────────────────────────────────────────────────
class _Encoder(json.JSONEncoder):
    def default(self, obj):
        import numpy as np
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return None if math.isnan(float(obj)) else float(obj)
        if isinstance(obj, (np.ndarray,)):
            return obj.tolist()
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        return super().default(obj)


def _to_camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def _camel_keys(obj):
    if isinstance(obj, dict):
        return {_to_camel(k): _camel_keys(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_camel_keys(i) for i in obj]
    return obj


def to_json(data, path: Path):
    """Write data (dict/list) to JSON with camelCase keys."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = _camel_keys(data)
    with open(path, "w") as f:
        json.dump(payload, f, cls=_Encoder, indent=2, ensure_ascii=False)

