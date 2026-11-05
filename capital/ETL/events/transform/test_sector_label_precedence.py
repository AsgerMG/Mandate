"""A weekly re-run can never displace a curated sector label.

The defect this pins: on 2026-10-18 the cron ran restore -> apply-nace -> run ->
persist and regressed 164 curated labels in company_sector_labels (65 subsectors
blanked; 98 `recovered_2026_07_23` labels replaced by a NACE guess). Replayed on
the 2026-11-05 corpus, the original code reproduces exactly those 164, and also
blanks 112,925 curated labels in `companies` on every run. See the block above
`merge_label` in classify_taxonomy.py for the mechanism and the rule.

Two halves:
  PURE  the rule itself (merge_label, plan_persist, plan_restore) on the three
        real shapes of the regression. Needs nothing.
  DB    the four cron steps as the cron runs them -- the real CLI, as
        subprocesses -- TWICE, against a real Postgres whose tables come from
        ETL/schema/corpus_schema.sql, then asserts no curated label in either
        `companies` or the vault moved, and that the second pass writes nothing.

Run:
  python3 ETL/events/transform/test_sector_label_precedence.py
      DB half on CAPITAL_TEST_DATABASE_URL (a throwaway Postgres; a private
      schema is created and dropped), or on an ephemeral pgserver when the
      interpreter running this has both pgserver and capital's requirements.
  python3 ETL/events/transform/test_sector_label_precedence.py --pure-only

It refuses to run the DB half against the configured DATABASE_URL: this test
writes, and the store of record is not a fixture.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
ETL = HERE.parents[1]
ROOT = ETL.parent
sys.path.insert(0, str(ETL / "lib"))
import etl_env  # noqa: E402,F401  (stage dirs onto sys.path)

FAILURES: list[str] = []


def check(cond: bool, what: str) -> None:
    print(("  ok    " if cond else "  FAIL  ") + what)
    if not cond:
        FAILURES.append(what)


# ── PURE ────────────────────────────────────────────────────────────────────

def pure() -> None:
    from classify_taxonomy import merge_label, plan_persist, plan_restore, nace_label

    print("PURE: the rule")
    curated = ("media_creative", "audio_music", "recovered_2026_07_23")
    guess = nace_label(["Human health activities"], [])
    check(guess[0] == "health_life_sciences" and guess[2] == "nace",
          f"the backbone really does call this descriptor health: {guess}")
    check(merge_label(curated, guess) is None,
          "a NACE guess cannot replace a curated label (the audio company)")
    check(merge_label(("software_data_ai", "data_analytics", "nace_top"),
                      ("software_data_ai", None, "nace_top")) is None,
          "a NACE pass cannot blank a subsector an LLM filled")
    check(merge_label(curated, (None, None, None)) is None,
          "a backbone that says nothing cannot blank a label")
    check(merge_label((None, None, None), guess) == guess,
          "an empty label is filled")
    check(merge_label(("software_data_ai", None, "nace_top"),
                      ("software_data_ai", "data_analytics", "llm"))
          == ("software_data_ai", "data_analytics", "llm"),
          "curated outranks derived")
    check(merge_label(("software_data_ai", None, "nace_top"),
                      ("software_data_ai", "data_analytics", "nace_top"))
          == ("software_data_ai", "data_analytics", "nace_top"),
          "a missing subsector under the same sector is completed")
    check(merge_label(("software_data_ai", None, "nace_top"),
                      ("health_life_sciences", "health_general", "nace")) is None,
          "derived never moves a derived label to another sector")
    check(merge_label(("energy_cleantech", "solar", "llm"),
                      ("mobility_transport", "ev", "recovered_2026_07_23")) is None,
          "two curated labels never displace each other")

    vault = {"acme audio|NL": curated}
    changed = plan_persist(vault, [("ACME Audio ", "nl", *guess)])
    check(changed == {}, "persist leaves a curated vault row alone")
    changed = plan_persist({}, [("New Co", "DE", *guess)])
    check(changed == {"new co|DE": guess}, "persist adds a key it has never seen")
    upd = plan_restore({"acme audio|NL": curated},
                       [(1, "Acme Audio", "NL", *guess), (2, "Acme Audio", "NL", None, None, None)])
    check(sorted(upd) == [(*curated, 1), (*curated, 2)],
          "restore fills an empty row AND puts a curated label back over a guess")


# ── DB ──────────────────────────────────────────────────────────────────────

TABLES = ("companies", "public_funding_events", "company_sector_labels")


def ddl_for(tables) -> list[str]:
    """CREATE TABLE statements for `tables`, read from the schema authority
    rather than restated here."""
    sql = (ROOT / "ETL/schema/corpus_schema.sql").read_text()
    out = []
    for t in tables:
        m = re.search(rf'CREATE TABLE "{t}" \((.*?)\n\);', sql, re.S)
        assert m, f"{t} not in corpus_schema.sql"
        out.append(m.group(0))
    return out


SEED_COMPANIES = [
    # id, name, country, top, sub, method, tags on its events
    (1, "Acme Audio BV", "NL", "media_creative", "audio_music", "recovered_2026_07_23",
     ["Human health activities"]),                      # curated vs a NACE guess
    (2, "Datapartner s.r.o.", "CZ", "software_data_ai", "data_analytics", "nace_top",
     ["Computer programming activities"]),              # LLM-filled subsector
    (3, "Quiet Robotics GmbH", "DE", "robotics_automation", "industrial_robots",
     "recovered_2026_07_23", []),                       # NACE says nothing
    (4, "Fresh Pharma SA", "FR", None, None, None,
     ["Manufacture of basic pharmaceutical products"]), # empty: may be filled
    (5, "Vaulted Ltd", "IE", None, None, None, []),     # empty: vault restores it
]
SEED_VAULT = [
    ("acme audio bv|NL", "media_creative", "audio_music", "recovered_2026_07_23"),
    ("datapartner s.r.o.|CZ", "software_data_ai", "data_analytics", "nace_top"),
    ("quiet robotics gmbh|DE", "robotics_automation", "industrial_robots",
     "recovered_2026_07_23"),
    ("vaulted ltd|IE", "energy_cleantech", "hydrogen", "llm"),
]


def seed(con) -> None:
    for stmt in ddl_for(TABLES):
        con.execute(stmt)
    for cid, name, cc, top, sub, method, tags in SEED_COMPANIES:
        con.execute(
            "INSERT INTO companies (id, canonical_name, country, sector_top, subsector, "
            "sector_taxonomy_method) VALUES (%s,%s,%s,%s,%s,%s)",
            (cid, name, cc, top, sub, method))
        for i, tag in enumerate(tags or [None]):
            con.execute(
                "INSERT INTO public_funding_events (company_id, source, role, call_id, "
                "sector_tags_raw) VALUES (%s, 'test_src', 'direct', %s, %s)",
                (cid, f"c{cid}_{i}", tag))
    for row in SEED_VAULT:
        con.execute("INSERT INTO company_sector_labels (name_key, sector_top, "
                    "subsector, method) VALUES (%s,%s,%s,%s)", row)


def run_cron_steps(url: str) -> list[str]:
    env = {**os.environ, "DATABASE_URL": url, "CAPITAL_RO_DATABASE_URL": url,
           "ANTHROPIC_API_KEY": ""}
    out = []
    script = str(HERE / "classify_taxonomy.py")
    # The cron's own sequence, minus the paid `run` (it is gated on a key here
    # and writes through the same merge_label as everything else).
    for step in (["restore"], ["apply-nace"], ["persist"]):
        p = subprocess.run([sys.executable, script, *step], env=env,
                           capture_output=True, text=True)
        if p.returncode:
            raise SystemExit(f"{step} failed:\n{p.stdout}\n{p.stderr}")
        out.append(p.stdout)
    return out


def snapshot(con) -> tuple[dict, dict]:
    comp = {r[0]: r[1:] for r in con.execute(
        "SELECT id, sector_top, subsector, sector_taxonomy_method FROM companies")}
    vault = {r[0]: r[1:] for r in con.execute(
        "SELECT name_key, sector_top, subsector, method FROM company_sector_labels")}
    return comp, vault


def db_half(base_url: str) -> None:
    import psycopg

    schema = f"test_labels_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(base_url, autocommit=True) as admin:
        admin.execute(f"CREATE SCHEMA {schema}")
    sep = "&" if "?" in base_url else "?"
    url = f"{base_url}{sep}options=-csearch_path%3D{schema}"
    try:
        with psycopg.connect(url) as con:
            seed(con)
        print("DB: the cron's classify steps, twice, on a seeded store")
        logs = run_cron_steps(url)
        with psycopg.connect(url) as con:
            comp1, vault1 = snapshot(con)
        logs += run_cron_steps(url)
        with psycopg.connect(url) as con:
            comp2, vault2 = snapshot(con)

        check(comp1[1] == ("media_creative", "audio_music", "recovered_2026_07_23"),
              f"curated label survives a NACE guess in companies: {comp1[1]}")
        check(comp1[2] == ("software_data_ai", "data_analytics", "nace_top"),
              f"LLM-filled subsector survives in companies: {comp1[2]}")
        check(comp1[3] == ("robotics_automation", "industrial_robots",
                           "recovered_2026_07_23"),
              f"a label NACE cannot resolve is not blanked: {comp1[3]}")
        check(comp1[4][0] == "health_life_sciences" and comp1[4][2] == "nace",
              f"an empty row is still filled by the backbone: {comp1[4]}")
        check(comp1[5] == ("energy_cleantech", "hydrogen", "llm"),
              f"an empty row is restored from the vault: {comp1[5]}")
        for key, *lab in SEED_VAULT:
            check(vault1[key] == tuple(lab), f"vault row {key!r} unchanged")
        check("fresh pharma sa|FR" in vault1, "a newly labelled company enters the vault")
        check((comp2, vault2) == (comp1, vault1),
              "a second run changes nothing (idempotent)")
        check("written 0" in logs[4] and "0 new, 0 completed" in logs[5],
              "the second apply-nace and persist write nothing")
    finally:
        with psycopg.connect(base_url, autocommit=True) as admin:
            admin.execute(f"DROP SCHEMA {schema} CASCADE")


def _test_url() -> tuple[str | None, object]:
    url = os.environ.get("CAPITAL_TEST_DATABASE_URL")
    if url:
        live = {(os.environ.get(k) or "").strip() for k in
                ("DATABASE_URL", "CAPITAL_RO_DATABASE_URL")} - {""}
        if url.strip() in live:
            raise SystemExit("CAPITAL_TEST_DATABASE_URL is the configured store. "
                             "This test writes; point it at a throwaway Postgres.")
        return url, None
    try:
        import pgserver  # type: ignore
    except ImportError:
        return None, None
    srv = pgserver.get_server(tempfile.mkdtemp(prefix="capital_labels_"))
    return srv.get_uri(), srv


def main() -> int:
    pure()
    if "--pure-only" not in sys.argv:
        url, srv = _test_url()
        if not url:
            print("\nFAIL: no Postgres for the DB half. Set CAPITAL_TEST_DATABASE_URL "
                  "(any throwaway Postgres), install pgserver, or pass --pure-only.")
            return 1
        try:
            db_half(url)
        finally:
            if srv is not None:
                srv.cleanup()
    if FAILURES:
        print(f"\n{len(FAILURES)} failure(s)")
        return 1
    print("\nall checks passed: no re-run can displace a curated label")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
