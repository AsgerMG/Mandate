"""Repair published eligibility prose that states somebody else's test.

── The founder harm this closes ───────────────────────────────────────────
`classify_applicant_identity.py` judges, per published text, WHOSE test it
states: the entity that would SUBMIT the application and sign the funding
contract, or the entity the money is ultimately spent on. When those differ --
a guarantee the borrower's bank applies for, a cluster envelope the cluster
organisation applies for, a risk-finance scheme delivered through financial
intermediaries -- a `who may apply` block written about the second population
routes a founder to a fund that will reject them at the end. That is worse than
omitting the fund: they spend the effort first.

`check_applicant_identity.ts` fails the build on such a text. This is the thing
that makes the build green again HONESTLY, by changing the corpus rather than
the verdict.

── Why this is not retract_unpertinent_text.py ────────────────────────────
That script answers one question -- is this text the right KIND of statement --
and has one action, because a report about somebody's completed grant can only
be withdrawn. This one has two, and the choice matters:

  * Most bodies DO publish who submits, in their own words, usually one
    sentence above the paragraph that got scraped. Taking that sentence and
    putting it first turns a trap into a signal: the founder reads "your bank
    submits this" and self-selects out in ten seconds. A blank column tells
    them nothing and leaves the fund just as recommendable.
  * Where the body publishes no applicant test at all -- or publishes one we
    cannot read at source -- the claim is withdrawn, as before. Never invented.

── Why the repairs live in a file and this is still not an enumeration ────
`reference/applicant_identity_repairs.json` names ids, and that is fine,
because it is not what DETECTS anything. The detector is the property in the
classifier, applied per text; the test is derived, per text, in
`check_applicant_identity.ts`. A row reaches this file only after the property
has already condemned it.

The join between them is the line that matters: a text judged
`beneficiary_not_applicant` at the current property version with NO entry in
the repairs file is a hard FAILURE of this script, naming the row. So loading a
sixth delivery scheme tomorrow cannot go quiet -- the classifier condemns it,
this refuses to run, and somebody has to go and read the funder's page. The
file can never become the place a defect is kept.

── Both stores, and the derived index ─────────────────────────────────────
Same contract as the retraction script, for the same three reasons.
`migrate_to_postgres.py` truncate-and-reloads `funding_instruments` FROM
SQLite, so a Postgres-only repair is undone by the next publish. Postgres is
the read path, so a SQLite-only repair changes nothing a founder sees. And
`instrument_profiles` embeds this column as "Who may apply, from the scheme's
own page" and is the primary ranking signal, so its row is deleted for every
repaired instrument -- both rebuild paths are anti-joins on instrument_id and
would otherwise go on ranking founders against the withdrawn sentence.

Idempotent and re-runnable: a repaired text is a different string, so the next
run finds nothing to do. If an extractor re-writes the original, the cached
verdict is keyed on the TEXT and already condemns it, the check goes red, and
re-running this repairs it again.

── After a run ────────────────────────────────────────────────────────────
A replaced text is a text nobody has judged. Re-run the classifier before
expecting the check to pass:

    python3 ETL/terms/classify_applicant_identity.py --classify

That is the point, not an inconvenience: the repair is submitted to the same
property that condemned the original, so a rewrite that merely reshuffles the
same beneficiary claim stays red.

Usage:
  python3 ETL/terms/repair_applicant_identity.py            # report only
  python3 ETL/terms/repair_applicant_identity.py --write    # SQLite AND Postgres
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import DB, ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse  # noqa: E402
import datetime  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402

CACHE = ROOT / "data" / "applicant_identity.json"
REPAIRS = ROOT / "reference" / "applicant_identity_repairs.json"
#: The SAME ledger the pertinence retraction writes to. Two files would be two
#: answers to "what have we withdrawn and why".
LEDGER = ROOT / "data" / "retracted_eligibility_text.json"

#: Cleared together on a retraction: the latter two are provenance for the
#: retracted prose and nothing else. Identical to retract_unpertinent_text.py.
TEXT_COLUMNS = ("eligibility_text", "eligibility_source_url",
                "eligibility_confidence")

#: The threshold the classifier and the check both use. All three must agree or
#: this repairs a population neither of them looked at.
MIN_LEN = 40

#: The verdict this script exists to answer.
CONDEMNED = "beneficiary_not_applicant"


def _load_env() -> None:
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            m = re.match(r"^([A-Z_]+)=(.*)$", line)
            if m:
                os.environ.setdefault(m.group(1), m.group(2).strip("\"'"))


def digest(text: str) -> str:
    """Byte-identical to `digest()` in classify_applicant_identity.py and to the
    one in check_applicant_identity.ts. All three must agree or this repairs
    nothing while the check fails on everything."""
    return hashlib.sha256(
        re.sub(r"\s+", " ", text or "").strip().encode()).hexdigest()[:16]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true",
                    help="apply to SQLite AND Postgres; without it, report only")
    args = ap.parse_args()
    _load_env()

    if not CACHE.exists():
        raise SystemExit(
            f"{CACHE} is missing; applicant identity has never been judged. Run: "
            f"python3 ETL/terms/classify_applicant_identity.py --classify")
    cache_file = json.loads(CACHE.read_text())
    cache = cache_file["verdicts"]
    version = cache_file["_property_version"]
    repairs = json.loads(REPAIRS.read_text())["repairs"]

    conn = sqlite3.connect(DB)
    rows = conn.execute(
        f"SELECT id, country, eligibility_text FROM funding_instruments "
        f"WHERE length(COALESCE(eligibility_text,'')) > {MIN_LEN}").fetchall()

    condemned, stale, unjudged = [], 0, 0
    for iid, cc, text in rows:
        entry = cache.get(digest(text))
        if entry is None:
            unjudged += 1
        elif entry.get("v", 1) != version:
            stale += 1
        elif entry["verdict"] == CONDEMNED:
            condemned.append((iid, cc, text, entry))

    print(f"{len(rows)} rows carry eligibility_text over {MIN_LEN} chars")
    print(f"  {unjudged:4d} unjudged                       (not repaired -- judge them first)")
    print(f"  {stale:4d} judged at v<{version}                  (not repaired -- re-run the classifier)")
    print(f"  {len(condemned):4d} judged {CONDEMNED} at v{version}")

    # ── The join that stops this file becoming an orphanage ─────────────────
    # A condemned row with no repair is not a row to skip. It is a founder
    # being routed to a fund that will reject them, and the only correct
    # response is to stop and go read the funder's page.
    missing = [(iid, cc, e) for iid, cc, _t, e in condemned if iid not in repairs]
    if missing:
        print(f"\nFAILED: {len(missing)} condemned row(s) have no entry in "
              f"{REPAIRS.relative_to(ROOT)}:")
        for iid, cc, e in missing:
            print(f"    {cc or '--':<3} {iid}")
            print(f"        {e['reason']}")
        raise SystemExit(
            "\nRead the funder's own 'who may apply' block and add a `replace` with\n"
            "its words and its URL, or a `retract` saying the funder publishes none.\n"
            "Do not edit the verdict, and do not invent an applicant.")

    plan = []
    for iid, cc, text, entry in condemned:
        r = repairs[iid]
        action = r.get("action")
        if action not in ("replace", "retract"):
            raise SystemExit(f"{iid}: action must be `replace` or `retract`, got {action!r}")
        if action == "replace":
            new = re.sub(r"\s+", " ", r.get("text") or "").strip()
            if len(new) <= MIN_LEN:
                raise SystemExit(
                    f"{iid}: `replace` needs a `text` over {MIN_LEN} chars, or the row "
                    f"leaves this script's population and is never judged again. "
                    f"Use `retract` to withdraw.")
            if not r.get("source_url"):
                raise SystemExit(f"{iid}: `replace` needs the `source_url` the words "
                                 f"are published at. Rule Zero.")
            if digest(new) == digest(text):
                # Not a repair. Would leave the row condemned and this green.
                raise SystemExit(f"{iid}: `text` is the text already published.")
        plan.append((iid, cc, text, entry, r))

    for iid, cc, text, entry, r in plan:
        # Flattened outside the f-string: an f-string expression may not contain
        # a backslash, and that trap has already made one applier on this repo
        # unrunnable (see ab37cfe9).
        head = re.sub(r"\s+", " ", text).strip()[:90]
        print(f"\n  {r['action'].upper():<8} {cc or '--':<3} {iid}")
        print(f"      was: {head!r}")
        if r["action"] == "replace":
            now = re.sub(r"\s+", " ", r["text"]).strip()[:90]
            print(f"      now: {now!r}")
            print(f"      src: {r['source_url']}")
        print(f"      why: {r['why'][:150]}")

    if not plan:
        print("\nnothing to repair.")
        return
    if not args.write:
        print("\n[report only] --write to apply")
        return

    # ── Archive BEFORE writing ─────────────────────────────────────────────
    # Every text this script removes from the product is archived, replacement
    # and retraction alike. A replacement destroys evidence exactly as much as
    # a retraction does, and "what did we tell founders last week" must survive
    # the fix.
    ledger = json.loads(LEDGER.read_text()) if LEDGER.exists() else {"retractions": []}
    known = {(r["id"], r["digest"]) for r in ledger["retractions"]}
    stamp = datetime.date.today().isoformat()
    for iid, cc, text, entry, r in plan:
        if (iid, digest(text)) in known:
            continue
        ledger["retractions"].append({
            "id": iid, "country": cc, "retracted_on": stamp,
            "digest": digest(text), "verdict": entry["verdict"],
            "property_version": version, "reason": entry["reason"],
            "text": text,
            "repair": r["action"],
            "repair_source_url": r.get("source_url"),
        })
    ledger["_comment"] = (
        "Eligibility prose withdrawn from the product. Written by "
        "ETL/terms/retract_unpertinent_text.py (text that stated nothing an "
        "applicant could act on) and by ETL/terms/repair_applicant_identity.py "
        "(text that stated somebody else's test -- those rows carry `repair`, "
        "which is `retract` if nothing replaced them and `replace` if the "
        "funder's own applicant block did). This is the audit record, not a "
        "source: nothing reads it back into the corpus. It exists so a "
        "withdrawal can be reviewed after the column has changed, and so "
        "re-publishing a withdrawn claim is a visible act.")
    ledger["retractions"].sort(key=lambda r: (r["id"], r["digest"]))
    LEDGER.write_text(json.dumps(ledger, indent=1, ensure_ascii=False) + "\n")
    print(f"\narchived {len(ledger['retractions'])} withdrawal(s) to "
          f"{LEDGER.relative_to(ROOT)}")

    sets = ", ".join(f"{c} = NULL" for c in TEXT_COLUMNS)
    clears = [(i,) for i, _c, _t, _e, r in plan if r["action"] == "retract"]
    writes = [(re.sub(r"\s+", " ", r["text"]).strip(), r["source_url"],
               r.get("confidence", "high"), i)
              for i, _c, _t, _e, r in plan if r["action"] == "replace"]
    upd = (f"UPDATE funding_instruments SET eligibility_text = {{p}}, "
           f"eligibility_source_url = {{p}}, eligibility_confidence = {{p}} "
           f"WHERE id = {{p}}")

    conn.executemany(f"UPDATE funding_instruments SET {sets} WHERE id = ?", clears)
    conn.executemany(upd.format(p="?"), writes)
    conn.commit()
    conn.close()
    print(f"SQLite: {len(writes)} replaced, {len(clears)} retracted")

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("DATABASE_URL not set (expected in the repo-root "
                         ".env.local). SQLite is repaired; Postgres is NOT -- "
                         "re-run with it set, or the read path still serves the "
                         "old text.")
    import psycopg2  # lazy: a report-only run needs no driver
    pg = psycopg2.connect(dsn)
    with pg, pg.cursor() as cur:
        cur.executemany(f"UPDATE funding_instruments SET {sets} WHERE id = %s", clears)
        cur.executemany(upd.format(p="%s"), writes)
        # See the module header: the derived index would otherwise go on
        # ranking founders against the sentence just withdrawn from them.
        cur.execute("DELETE FROM instrument_profiles WHERE instrument_id = ANY(%s)",
                    ([i for i, _c, _t, _e, _r in plan],))
        dropped = cur.rowcount or 0
    pg.close()
    print(f"Postgres: {len(writes)} replaced, {len(clears)} retracted")
    print(f"invalidated {dropped} instrument_profiles row(s) -- re-embed with "
          f"`python3 ETL/terms/build_instrument_profiles.py run`")
    print("\nA replaced text is a text nobody has judged. Next:\n"
          "  python3 ETL/terms/classify_applicant_identity.py --classify")


if __name__ == "__main__":
    main()
