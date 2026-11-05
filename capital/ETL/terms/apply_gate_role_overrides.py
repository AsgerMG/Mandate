"""Reapply every curated gate correction after the LLM passes that set it.

THREE columns, one applier, one point in the pipeline: gate_role (may this rule
decide at all), and intake_field_resolved + value_spec (WHAT does it decide
on). The third and fourth arrived on 2026-08-11, when nineteen deciding rules
were found asking the founder a question their own text does not turn on -- a
50% Russian-ownership exclusion asked as "is any single shareholder above
25%?", a China control rule asked as "are you controlled from outside the EU?".
There was a durable home for a role correction and none for an encoding
correction, so those had to be made with an UPDATE and were reverted by the
next `encode` pass, silently, in the direction that hides funds.


encode_gates.py triages every gate with a paid model call and writes gate_role
directly, so a correction made in the database is silently reverted the next
time triage runs. This puts the corrections back, from TWO sources:

  1. reference/gate_role_overrides.json -- hand corrections, one entry per
     gate, each carrying the reasoning for that specific case. Read the file.
  2. data/eligibility_pertinence.json -- the pertinence verdicts, keyed by a
     digest of the requirement TEXT. Any deciding gate whose text was judged a
     REPORT rather than a CONDITION is demoted here. See
     ETL/terms/classify_eligibility_pertinence.py for the property, and
     web/scripts/check_gate_pertinence.ts for the test that fails
     the build when this has not been run.

Both sources demote the same way and for the same reason, so they are applied
by the same script and at the same point in the pipeline. A second applier
would be a second place to forget.

WHY THIS AND NOT DELETION. A gate judged a report is usually TRUE, sourced, and
worth showing -- "only pre-selected undertakings listed in the notification are
eligible beneficiaries" tells a founder something real about the instrument.
What it may not do is DECIDE, because it can never be true-or-false of an
applicant. `programme_fact` is exactly that home: it still renders as a
structuring note on the row, and `verdict.ts::isFilter()` will not look at it.
Deleting it would destroy sourced evidence to fix a routing mistake.

Both stores, always. SQLite is where the ETL works and Postgres is what the
product reads. This wrote SQLite only until 2026-08-07, which meant a gate
demoted here kept deciding verdicts in production until the next full publish --
the exact failure mode the rest of the ETL writes both stores to avoid.

Usage: python3 ETL/terms/apply_gate_role_overrides.py
       python3 ETL/terms/apply_gate_role_overrides.py --dry-run
"""
from __future__ import annotations

import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402

import argparse  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

SRC = ROOT / "reference" / "gate_role_overrides.json"
ENCODINGS = ROOT / "reference" / "gate_encoding_overrides.json"
PERTINENCE = ROOT / "data" / "eligibility_pertinence.json"

#: Where a gate goes when its text is a report rather than a condition. Not a
#: new role: `programme_fact` already means "true of the instrument, says
#: nothing about who qualifies", which is precisely what a compatibility
#: finding, a budget line or a post-award duty is.
DEMOTED_ROLE = "programme_fact"


def _digest(text: str) -> str:
    """Byte-identical to digest() in classify_eligibility_pertinence.py and to
    digest() in check_gate_pertinence.ts. Three implementations is two too
    many, but they are in three languages; the calibration cases are keyed the
    same way and so exercise all three agreeing."""
    return hashlib.sha256(re.sub(r"\s+", " ", text or "").strip().encode()).hexdigest()[:16]


def _database_url() -> str | None:
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r"^([A-Z_]+)=(.*)$", line)
            if m:
                os.environ.setdefault(m.group(1), m.group(2).strip("\"'"))
    return os.environ.get("DATABASE_URL")


def _report_digests() -> dict[str, str]:
    """digest -> the model's one-line reason, for every text judged a report.

    ONLY `report` demotes. `demand_match` -- a fact about the size, form or
    channel of the offer, which intake asks the founder to state their own
    counterpart for -- keeps deciding, because what it is compared against is
    the founder's own declared want. That distinction is the whole of the
    2026-08-08 property change; see classify_eligibility_pertinence.py for why
    the binary version would have demoted about twenty correct gates here.
    """
    if not PERTINENCE.exists():
        print("no eligibility_pertinence.json; only hand overrides will be applied")
        return {}
    verdicts = json.loads(PERTINENCE.read_text())["verdicts"]
    return {d: v["reason"] for d, v in verdicts.items() if v["verdict"] == "report"}


def pertinence_targets(conn: sqlite3.Connection, reports: dict[str, str]) -> list[tuple]:
    """Which deciding gates carry a text judged a report.

    Resolved against the gate table rather than stored as a list of ids: a gate
    that acquires that text tomorrow, under a new key or a new instrument, is
    caught without anyone updating a file. NULL gate_role counts, because
    `isFilter()` honours an untriaged gate as a filter -- NULL is not neutral.
    """
    rows = conn.execute(
        """SELECT instrument_id, gate_key, requirement, value_spec
             FROM eligibility_gates
            WHERE (gate_role IS NULL OR gate_role = 'filter')
              AND coalesce(requirement,'') <> ''""").fetchall()
    out = []
    for instrument_id, gate_key, requirement, value_spec in rows:
        d = _digest(requirement)
        if d in reports:
            out.append((instrument_id, gate_key, reports[d], bool(value_spec), requirement))
    return out


def _encoding_rows() -> list[tuple]:
    """(instrument_id, gate_key, field, spec_json_or_None, why) per correction.

    `field: none` plus `spec: null` is a QUARANTINE: the requirement text stays
    on the row and is still shown, only the machine verdict stops. That is
    already the convention in audit_encoding_vs_reality.py and
    encode_gates.py's country repair, and it is the right outcome whenever the
    fact a rule turns on -- which state controls the company, whether the
    holder is a public body -- is not a fact intake asks for.
    """
    if not ENCODINGS.exists():
        print("no gate_encoding_overrides.json; no encoding corrections to apply")
        return []
    out = []
    for o in json.loads(ENCODINGS.read_text())["overrides"]:
        spec = o.get("spec")
        if spec is not None and spec.get("field") != o.get("field"):
            raise SystemExit(
                f"{o['instrument_id']}/{o['gate_key']}: spec.field {spec.get('field')!r} "
                f"disagrees with field {o.get('field')!r}. The comparator looks its answer "
                f"up by spec.field and everything else reads intake_field_resolved, so two "
                f"names here is a rule that evaluates one question and reports another.")
        out.append((o["instrument_id"], o["gate_key"], o.get("field") or "none",
                    json.dumps(spec, ensure_ascii=False) if spec is not None else None,
                    o.get("why", "")))
    return out


def _apply_encodings(run, rows: list[tuple], p: str, ne: str) -> tuple[int, int, int]:
    """Write the encoding corrections through whichever store `run` talks to.

    One body for both stores, because the pair of loops this file already keeps
    in step by hand is one pair too many. `run(sql, params) -> rowcount` is the
    only difference between them; `p` is the placeholder that store uses and
    `ne` its null-safe inequality.

    A row that changed nothing is reported as ALREADY, and a row that matched
    no gate as STALE. Silence between the two is how an override file rots into
    a description of gates that no longer exist.
    """
    applied = already = stale = 0
    for instrument_id, gate_key, field, spec, why in rows:
        note = "encoding override: " + re.sub(r"\s+", " ", why)[:180]
        n = run(f"""UPDATE eligibility_gates
                       SET intake_field_resolved = {p},
                           value_spec = {p},
                           encoding_method = 'curated_override',
                           verify_note = COALESCE(verify_note, '') || {p}
                     WHERE instrument_id = {p} AND gate_key = {p}
                       AND (intake_field_resolved {ne} {p} OR value_spec {ne} {p})""",
                (field, spec, " | " + note, instrument_id, gate_key, field, spec))
        if n:
            applied += 1
            continue
        # Nothing changed. Either the correction is already in force, or the
        # gate is gone. Keyed on the CURRENT VALUES rather than on
        # encoding_method, so editing an entry in the file re-applies it: a
        # guard that only fires the first time would let a revised correction
        # sit in git looking applied.
        exists = run(f"""UPDATE eligibility_gates SET encoding_method = 'curated_override'
                          WHERE instrument_id = {p} AND gate_key = {p}""",
                     (instrument_id, gate_key))
        if exists:
            already += 1
        else:
            stale += 1
            print(f"  STALE ENCODING OVERRIDE: {instrument_id}/{gate_key} no longer exists")
    return applied, already, stale


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="name what would change, write nothing")
    args = ap.parse_args()

    overrides = json.loads(SRC.read_text())["overrides"] if SRC.exists() else []
    if not SRC.exists():
        print("no gate_role_overrides.json; only pertinence verdicts will be applied")
    encodings = _encoding_rows()
    reports = _report_digests()

    conn = sqlite3.connect(DB)
    targets = pertinence_targets(conn, reports)
    evaluable = [t for t in targets if t[3]]
    print(f"{len(overrides)} hand overrides; {len(encodings)} encoding corrections; "
          f"{len(reports)} texts judged REPORT, "
          f"matching {len(targets)} deciding gate(s), {len(evaluable)} with a "
          f"value_spec (those can disqualify a founder silently)")
    for instrument_id, gate_key, reason, spec, requirement in targets[:15]:
        flat = re.sub(r"\s+", " ", requirement)[:110]
        print(f"    {instrument_id}/{gate_key}{'  <- value_spec' if spec else ''}\n"
              f"      {flat}\n      {reason}")
    if len(targets) > 15:
        print(f"    ... and {len(targets) - 15} more")

    if args.dry_run:
        conn.close()
        print("\n--dry-run: nothing written")
        return

    # ── SQLite ───────────────────────────────────────────────────────────────
    # Pertinence FIRST, hand overrides SECOND, so a curated decision wins over
    # the classifier. The ordering is the precedence: a human who has read the
    # gate and its source is a better authority than a model reading one
    # sentence, and `_kept_as_filters` in the overrides file is exactly that --
    # rules whose wording hedges a THRESHOLD while stating a real requirement.
    demoted = 0
    for instrument_id, gate_key, _reason, _spec, _req in targets:
        cur = conn.execute(
            """UPDATE eligibility_gates
                 SET gate_role = ?, intake_field_resolved = 'none',
                     encoding_method = 'pertinence'
               WHERE instrument_id = ? AND gate_key = ?""",
            (DEMOTED_ROLE, instrument_id, gate_key))
        demoted += cur.rowcount
    applied = missing = 0
    for o in overrides:
        # A hand override to `filter` is a decision to KEEP the gate deciding,
        # so it must not also blank intake_field_resolved -- that would leave
        # the role saying "this decides" and the resolved field saying "nothing
        # can evaluate it", which is a demotion wearing a filter's name.
        cur = conn.execute(
            """UPDATE eligibility_gates
                 SET gate_role = ?,
                     intake_field_resolved = CASE WHEN ? = 'filter'
                                                  THEN intake_field_resolved
                                                  ELSE 'none' END
               WHERE instrument_id = ? AND gate_key = ? AND gate_role IS NOT ?""",
            (o["role"], o["role"], o["instrument_id"], o["gate_key"], o["role"]))
        if cur.rowcount:
            applied += 1
        else:
            # Either already correct, or the gate is gone. Both are worth
            # distinguishing from silence: a gate that vanished means the
            # override is now dead weight describing nothing.
            exists = conn.execute(
                "SELECT 1 FROM eligibility_gates WHERE instrument_id=? AND gate_key=?",
                (o["instrument_id"], o["gate_key"])).fetchone()
            if not exists:
                missing += 1
                print(f"  STALE OVERRIDE: {o['instrument_id']}/{o['gate_key']} no longer exists")
    # Encodings LAST of the three, and deliberately so: a gate whose role was
    # just corrected may still be pointing at the wrong question, and a gate
    # this file quarantines must not be re-pointed by anything after it.
    def _sqlite(sql, params):
        return conn.execute(sql, params).rowcount
    enc_applied, enc_already, enc_stale = _apply_encodings(_sqlite, encodings, "?", "IS NOT")
    conn.commit()
    conn.close()
    print(f"sqlite: {applied} hand overrides applied, {missing} stale, "
          f"{demoted} demoted on pertinence; "
          f"{enc_applied} encodings corrected, {enc_already} already, {enc_stale} stale")

    # ── Postgres ─────────────────────────────────────────────────────────────
    url = _database_url()
    if not url:
        raise SystemExit(
            "DATABASE_URL is not set. SQLite alone is not a demotion -- the "
            "product reads Postgres, and a gate left as `filter` there can "
            "still disqualify a founder silently.")
    import psycopg2  # noqa: PLC0415  -- optional dep, only this path needs it
    pg = psycopg2.connect(url)
    with pg, pg.cursor() as cur:
        # Same order as SQLite: pertinence first, hand overrides second, so a
        # curated decision wins. Two stores that applied the same corrections
        # in different orders would disagree, which is the failure this script
        # exists to prevent rather than commit.
        m = 0
        for instrument_id, gate_key, _reason, _spec, _req in targets:
            cur.execute(
                """UPDATE eligibility_gates
                     SET gate_role = %s, intake_field_resolved = 'none',
                         encoding_method = 'pertinence'
                   WHERE instrument_id = %s AND gate_key = %s
                     AND gate_role IS DISTINCT FROM %s""",
                (DEMOTED_ROLE, instrument_id, gate_key, DEMOTED_ROLE))
            m += cur.rowcount
        n = 0
        for o in overrides:
            cur.execute(
                """UPDATE eligibility_gates
                     SET gate_role = %s,
                         intake_field_resolved = CASE WHEN %s = 'filter'
                                                      THEN intake_field_resolved
                                                      ELSE 'none' END
                   WHERE instrument_id = %s AND gate_key = %s
                     AND gate_role IS DISTINCT FROM %s""",
                (o["role"], o["role"], o["instrument_id"], o["gate_key"], o["role"]))
            n += cur.rowcount
        def _pg(sql, params):
            cur.execute(sql, params)
            return cur.rowcount
        e_applied, e_already, e_stale = _apply_encodings(
            _pg, encodings, "%s", "IS DISTINCT FROM")
        print(f"postgres: {n} hand overrides applied, {m} demoted on pertinence; "
              f"{e_applied} encodings corrected, {e_already} already, {e_stale} stale")

        # Reconciled the same way the roles are, and for a sharper reason: a
        # correction that did not take here is a founder still being screened
        # out by the wrong question in production, while SQLite and the
        # committed snapshot both say it was fixed.
        off = []
        for instrument_id, gate_key, field, spec, _why in encodings:
            cur.execute(
                """SELECT intake_field_resolved, value_spec FROM eligibility_gates
                    WHERE instrument_id = %s AND gate_key = %s""",
                (instrument_id, gate_key))
            row = cur.fetchone()
            if row and (row[0] != field or (row[1] or None) != spec):
                off.append(f"{instrument_id}/{gate_key} is {row[0]}/{row[1]}, asked for {field}/{spec}")
        print(f"postgres: {len(off)} of {len(encodings)} encoding corrections did not take"
              + ("" if not off else "  <- " + "; ".join(off)))

        # Reconciled out of Postgres, so the run reports what the PRODUCT sees.
        # Both classes, in one query, because "I applied N updates" is a claim
        # about this process and "0 still decide" is a claim about the corpus.
        # Asked per override against the role it ASKED FOR, not against the
        # literal string 'filter': an override may legitimately keep a gate
        # deciding, and a reconciliation that counted those as failures would
        # have to be ignored, which is how a check stops being read.
        wrong = []
        for o in overrides:
            cur.execute(
                """SELECT gate_role FROM eligibility_gates
                    WHERE instrument_id = %s AND gate_key = %s""",
                (o["instrument_id"], o["gate_key"]))
            row = cur.fetchone()
            if row and row[0] != o["role"]:
                wrong.append(f"{o['instrument_id']}/{o['gate_key']} "
                             f"is {row[0]}, asked for {o['role']}")
        print(f"postgres: {len(wrong)} of {len(overrides)} hand overrides did not take"
              + ("" if not wrong else "  <- " + "; ".join(wrong)))
        cur.execute(
            """SELECT count(*) FROM eligibility_gates
                WHERE (gate_role IS NULL OR gate_role = 'filter')
                  AND coalesce(requirement,'') <> ''""")
        deciding = cur.fetchone()[0]
        print(f"postgres: {deciding} gates can still decide a verdict")
    pg.close()


if __name__ == "__main__":
    main()
