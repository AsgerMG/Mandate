"""classify_taxonomy.py `run` on the Message Batch helper: no model, no spend.

    python3 ETL/events/transform/test_taxonomy_batch.py       (needs a throwaway Postgres:
        CAPITAL_TEST_DATABASE_URL, or pgserver; --pure-only skips the DB half)

PURE: labels_from_results maps each result by custom_id exactly as the old
      in-process loop did (full -> llm label, sub-only -> the Tier-1 it was
      ASKED under, entity -> entity type only), and counts failures.
DB:   the weekly shape, twice. Run 1 submits and the batch has not ended: the
      run returns inside its wait budget and writes nothing. Somebody curates a
      label in between. Run 2 collects the batch first, writes through
      merge_label (the curated label survives the late batch), resubmits
      nothing that was in flight, and a third run is free.
"""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace as NS

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import test_sector_label_precedence as T  # noqa: E402  (etl_env, check, ddl_for)
import classify_taxonomy as C  # noqa: E402
from mandate.llm.batch import Batcher, MemoryStore, Result  # noqa: E402
from mandate.llm.testing import FakeBatchClient  # noqa: E402

check = T.check


def pure() -> None:
    print("PURE: results -> labels")
    rs = [Result("f1", True, '{"sector_top": "energy_cleantech", "subsector": "hydrogen_fuel_cells", '
                             '"entity_type": "company", "reasoning": "x"}'),
          Result("s2", True, '{"subsector": "data_analytics", "entity_type": "research_org"}',
                 meta={"top": "software_data_ai"}),
          Result("s3", True, '{"subsector": "not_a_subsector", "entity_type": "nope"}'),
          Result("e4", True, '{"entity_type": "other"}'),
          Result("f5", False, None, error="errored:overloaded_error")]
    labels, ents, err = C.labels_from_results(rs, db_top={3: "software_data_ai"}.get)
    check(labels[1] == ("energy_cleantech", "hydrogen_fuel_cells", "llm"), f"full: {labels[1]}")
    check(labels[2] == ("software_data_ai", "data_analytics", None),
          "sub-only keeps the row's method and the Tier-1 it was asked under")
    check(labels[3] == ("software_data_ai", C.GENERAL["software_data_ai"], None),
          "an invalid subsector falls back to the sector's general one (legacy: top from DB)")
    check(4 not in labels and (C.ENTITY_TYPES[2], 4) in ents, "entity-only writes no label")
    check((None, 3) in ents and err == 1 and 5 not in labels, "bad entity -> None; failure counted")


ROWS = [  # id, name, country, top, sub, method
    (10, "Unlabelled Co", "DE", None, None, None),
    (11, "Half Labelled BV", "NL", "software_data_ai", None, "nace_top"),
    (12, "Will Be Curated SA", "FR", None, None, None),
]


def respond(cid, params):
    if cid.startswith("f"):
        return ("ok", '{"sector_top": "health_life_sciences", "subsector": "genomics", '
                      '"entity_type": "company", "reasoning": "r"}')
    if cid.startswith("s"):
        return ("ok", '{"subsector": "data_analytics", "entity_type": "company"}')
    return ("ok", '{"entity_type": "company"}')


def db_half(base_url: str) -> None:
    import psycopg
    schema = f"test_taxbatch_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(base_url, autocommit=True) as admin:
        admin.execute(f"CREATE SCHEMA {schema}")
    sep = "&" if "?" in base_url else "?"
    url = f"{base_url}{sep}options=-csearch_path%3D{schema}"
    saved = {k: os.environ.get(k) for k in ("DATABASE_URL", "CAPITAL_RO_DATABASE_URL",
                                             "ANTHROPIC_API_KEY")}
    os.environ.update(DATABASE_URL=url, CAPITAL_RO_DATABASE_URL=url, ANTHROPIC_API_KEY="fake")
    try:
        with psycopg.connect(url) as con:
            for stmt in T.ddl_for(T.TABLES):
                con.execute(stmt)
            for cid, name, cc, top, sub, method in ROWS:
                con.execute("INSERT INTO companies (id, canonical_name, country, sector_top, "
                            "subsector, sector_taxonomy_method) VALUES (%s,%s,%s,%s,%s,%s)",
                            (cid, name, cc, top, sub, method))
                con.execute("INSERT INTO public_funding_events (company_id, source, role, "
                            "call_id, project_title) VALUES (%s,'test_src','direct',%s,'A project')",
                            (cid, f"c{cid}"))
        print("DB: submit, not ended; curate in between; collect next run")
        fake = FakeBatchClient(respond, polls_to_end=10**9)
        store = MemoryStore()

        def run(**kw):
            args = NS(limit=0, dry_run=False, max_cost=20.0, chunk=18000, wait_minutes=2, **kw)
            b = Batcher(C.BATCH_KIND, store=store, client=fake, log=lambda s: None,
                        sleep=lambda s: None, clock=iter(range(0, 10**6, 30)).__next__)
            C.cmd_run(args, batcher=b)

        run()
        n1 = fake.n_requests
        with psycopg.connect(url) as con:
            before = {r[0]: r[1:] for r in con.execute(
                "SELECT id, sector_top, subsector, sector_taxonomy_method FROM companies")}
            con.execute("UPDATE companies SET sector_top='energy_cleantech', subsector='solar', "
                        "sector_taxonomy_method='recovered_2026_07_23' WHERE id = 12")
        check(n1 == 4 and before[10] == (None, None, None),
              f"run 1 submitted f10, f12, s11, e11 and, not ended, wrote nothing ({n1})")
        run()
        new = [r["custom_id"] for r in fake.created[-1][1]]
        check(fake.n_requests == n1 + 1 and new == ["e12"],
              f"run 2 resubmitted nothing in flight; only the newly curated row's entity type: {new}")
        fake.polls_to_end = 0
        run()
        with psycopg.connect(url) as con:
            after = {r[0]: r[1:] for r in con.execute(
                "SELECT id, sector_top, subsector, sector_taxonomy_method, entity_type "
                "FROM companies")}
        check(after[10] == ("health_life_sciences", "genomics", "llm", "company"),
              f"the late batch fills the empty row: {after[10]}")
        check(after[11] == ("software_data_ai", "data_analytics", "nace_top", "company"),
              f"sub-only completes the tier under its own sector: {after[11]}")
        check(after[12][:3] == ("energy_cleantech", "solar", "recovered_2026_07_23"),
              f"a label curated while the batch ran survives it: {after[12]}")
        check(all(r["status"] == "collected" for r in store.rows.values()),
              "every batch is marked collected")
        n3 = fake.n_requests
        run()
        check(fake.n_requests == n3, "a fourth run has nothing to submit")
        # no store: nothing is submitted and the cron records PARTIAL (rc 3)
        class NoStore(MemoryStore):
            def probe(self):
                from mandate.llm.batch import StoreUnavailable
                raise StoreUnavailable("relation mandate.llm_batches does not exist")
        with psycopg.connect(url) as con:
            con.execute("UPDATE companies SET sector_taxonomy_method = NULL WHERE id = 10")
        fake2 = FakeBatchClient(respond)
        try:
            C.cmd_run(NS(limit=0, dry_run=False, max_cost=20.0, chunk=18000, wait_minutes=0),
                      batcher=Batcher(C.BATCH_KIND, store=NoStore(), client=fake2))
            rc = 0
        except SystemExit as e:
            rc = e.code
        check(rc == C.RC_NO_STORE and fake2.created == [],
              "without the batch store nothing is submitted, exit 3 (cron: PARTIAL)")
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        with psycopg.connect(base_url, autocommit=True) as admin:
            admin.execute(f"DROP SCHEMA {schema} CASCADE")


def main() -> int:
    pure()
    if "--pure-only" not in sys.argv:
        url, srv = T._test_url()
        if not url:
            print("\nFAIL: no Postgres for the DB half (CAPITAL_TEST_DATABASE_URL or pgserver)")
            return 1
        try:
            db_half(url)
        finally:
            if srv is not None:
                srv.cleanup()
    if T.FAILURES:
        print(f"\n{len(T.FAILURES)} failure(s)")
        return 1
    print("\nall checks passed: the batch path writes what the live loop wrote, late or not")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
