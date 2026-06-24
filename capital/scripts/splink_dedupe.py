"""Probabilistic company-name dedupe with splink (proof of concept).

Why: hand-rolled string rules hit a ceiling — leading-token detection promotes
multilingual generic words ('hotel', 'stadtwerke', 'costruzioni') and can't tell
a brand from a surname. splink learns, from the corpus, that common tokens carry
near-zero matching weight and rare distinctive tokens carry high weight
(term-frequency adjustment) — systematically, no manual stoplist.

This script: load event-bearing companies, tokenise the normalised name, fit a
Fellegi-Sunter model (token overlap with TF adjustment + country), cluster at a
high threshold, and VALIDATE precision (big companies consolidate; Müller-type
surnames do NOT collapse). Read-only; writes a proposals CSV, no DB changes.
"""
import re
import sqlite3
import sys
import unicodedata
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from merge_companies import DB  # noqa: E402
from lib.merge_stoplist import LEGAL  # noqa: E402

from splink import Linker, SettingsCreator, DuckDBAPI, block_on  # noqa: E402
import splink.comparison_library as cl  # noqa: E402


def norm(nm: str) -> str:
    s = unicodedata.normalize("NFKD", nm or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    toks = [t for t in s.split() if t not in LEGAL and len(t) >= 2]
    return " ".join(toks)


def main():
    con = sqlite3.connect(DB)
    df = pd.read_sql_query(
        """SELECT c.id AS unique_id, c.canonical_name, COALESCE(c.country,'') AS country
           FROM companies c JOIN v_events v ON v.company_id=c.id GROUP BY c.id""", con)
    df["name_norm"] = df["canonical_name"].map(norm)
    df["name_tokens"] = df["name_norm"].map(lambda s: s.split())
    df = df[df["name_norm"].str.len() >= 2].reset_index(drop=True)
    print(f"loaded {len(df):,} companies")

    settings = SettingsCreator(
        link_type="dedupe_only",
        blocking_rules_to_generate_predictions=[
            block_on("country", "substr(name_norm,1,7)"),
        ],
        comparisons=[
            cl.ArrayIntersectAtSizes("name_tokens", [3, 2, 1]),
            cl.JaroWinklerAtThresholds("name_norm", [0.92, 0.85]),
            cl.ExactMatch("country").configure(term_frequency_adjustments=True),
        ],
        retain_intermediate_calculation_columns=True,
    )

    import duckdb
    duck = duckdb.connect()
    duck.execute("SET memory_limit='8GB'")
    duck.execute("SET temp_directory='/tmp/duckdb_spill'")
    duck.execute("SET preserve_insertion_order=false")
    db_api = DuckDBAPI(connection=duck)
    linker = Linker(df, settings, db_api)
    linker.training.estimate_probability_two_random_records_match(
        [block_on("name_norm")], recall=0.6)
    linker.training.estimate_u_using_random_sampling(max_pairs=1_000_000)
    linker.training.estimate_parameters_using_expectation_maximisation(block_on("country"))

    preds = linker.inference.predict(threshold_match_probability=0.9)
    clusters = linker.clustering.cluster_pairwise_predictions_at_threshold(
        preds, threshold_match_probability=0.95)
    cdf = clusters.as_pandas_dataframe()[["cluster_id", "unique_id", "canonical_name", "country"]]
    sizes = cdf.groupby("cluster_id").size()
    multi = sizes[sizes > 1]
    print(f"\nclusters with >1 member: {len(multi):,}  covering {int(multi.sum()):,} companies")
    print(f"distinct companies after clustering: {len(sizes):,} (from {len(df):,})")

    out = ROOT / "data" / "processed" / "splink_clusters.csv"
    cdf.to_csv(out, index=False)
    print(f"wrote {out}")

    name_by = cdf.set_index("unique_id")["canonical_name"]
    cl_by = cdf.set_index("unique_id")["cluster_id"]
    print("\n=== big-company consolidation (want 1 cluster each) ===")
    for b in ["siemens", "engie", "maersk", "thales", "volkswagen", "michelin", "vyoma"]:
        ids = df[df["name_norm"].str.contains(rf"\b{b}", regex=True)]["unique_id"]
        cls = {cl_by.get(i) for i in ids}
        print(f"  {b:12} {len(ids):3} companies -> {len(cls)} clusters")
    print("\n=== surname trap: Müller/Schmidt/Schneider should be MANY clusters ===")
    for b in ["muller", "schmidt", "schneider"]:
        ids = df[df["name_norm"].str.contains(rf"\b{b}", regex=True)]["unique_id"]
        cls = {cl_by.get(i) for i in ids}
        print(f"  {b:12} {len(ids):3} companies -> {len(cls)} clusters (more = better, NOT merged)")


if __name__ == "__main__":
    main()
