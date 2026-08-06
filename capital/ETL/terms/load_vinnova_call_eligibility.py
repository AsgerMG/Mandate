"""Per-programme eligibility text for the Vinnova regime, from Vinnova's own CC0 API.

── Why this source ────────────────────────────────────────────────────────
Regimes come in two shapes. A BODY-FRAGMENTED regime (Italy, Germany) has many
delivery bodies running one scheme, and `administering_body` collapses the
sibling class an order of magnitude before a character of text is read. A
PROGRAMME-FRAGMENTED regime has ONE body running many programmes, so the body
column is a constant and separates nothing.

This regime is the purest programme-fragmented case in the corpus: every leaf
carries the same body, one delivery region, no application URL, no scheme code
and no text, so every leaf is indistinguishable from every other. Per-programme
eligibility text is the only lever that exists, and it has to be text cut from
each programme's own call -- anything lifted from the agency's generic terms is
identical across all of them by construction and moves nothing.

── The source ─────────────────────────────────────────────────────────────
`data.vinnova.se` is the agency's official open-data API, CC0, already used by
`ETL/events/extract/extract_vinnova.py` for awards. Three registers join:

    program            Diarienummer, Titel
      -> utlysningar   DiarienummerProgram          (calls under a programme)
      -> ansokningsomgangar  DiarienummerUtlysning  (rounds under a call)

Each round carries `WebTextLista`, the three-field card Vinnova shows on every
call page. TextID 2 is "Vem kan söka?" -- who may apply. It is per-round and
genuinely per-programme, not agency boilerplate.

Text is written in Swedish, matching the corpus convention that
`eligibility_text` is the fund's own words in the fund's own language (the
German rows are German). Vinnova publishes an official English rendering of the
same field in the same record, so an English column would cost no fetch.

── Which round's rules to write ───────────────────────────────────────────
An OPEN round is a promise about the call in front of the founder, and is
written at high confidence. Where no round is open, the most recent closed
round is evidence about how the programme behaves and is written at MEDIUM --
a past round's rules are not a promise about the next call, and confidence is
where that has to be said.

── The boilerplate gate ───────────────────────────────────────────────────
Coverage is not the deliverable. A text identical to a sibling's is refused
however well-sourced it is, because it cannot help a founder choose between
them. Measured on this regime the risk did not materialise -- 48 leaves, 48
distinct texts -- but the gate stays, because the next programme family may
share wording and nobody would notice from the coverage number.

Usage:
  python3 ETL/terms/load_vinnova_call_eligibility.py --regime <parent_id>
  python3 ETL/terms/load_vinnova_call_eligibility.py --regime <parent_id> --write --postgres
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
import json  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import sqlite3  # noqa: E402
import urllib.request  # noqa: E402
from collections import defaultdict  # noqa: E402
from datetime import date, datetime, timezone  # noqa: E402

import psycopg2  # noqa: E402
import psycopg2.extras  # noqa: E402

API = "https://data.vinnova.se/api"
SINCE = "2018-01-01"
REGISTERS = ("program", "utlysningar", "ansokningsomgangar")
HOST = "vinnova.se"

WHO_MAY_APPLY = 2      # TextID of the "Vem kan söka?" card
MIN_TEXT = 40
MIN_SENTENCE = 40
MIN_OWN_SHARE = 0.34


def norm(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def env() -> None:
    for line in (_Path(ROOT) / ".env.local").read_text().splitlines():
        m = re.match(r"^([A-Z_]+)=(.*)$", line)
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip("\"'"))


def registers(cache: _Path, refresh: bool) -> dict[str, list[dict]]:
    cache.mkdir(parents=True, exist_ok=True)
    out = {}
    for name in REGISTERS:
        p = cache / f"{name}.json"
        if refresh or not p.exists():
            url = f"{API}/{name}/{SINCE}"
            print(f"  fetching {url}")
            with urllib.request.urlopen(url, timeout=300) as r:
                p.write_bytes(r.read())
        out[name] = json.loads(p.read_text())
        print(f"  {name}: {len(out[name])} records")
    return out


def who_may_apply(rec: dict) -> str:
    for w in rec.get("WebTextLista") or []:
        if w.get("TextID") == WHO_MAY_APPLY:
            return re.sub(r"\s+", " ", (w.get("TextSv") or "")).strip()
    return ""


def closes(rec: dict):
    s = rec.get("Stangningsdatum")
    try:
        return datetime.fromisoformat(s).date() if s else None
    except (ValueError, TypeError):
        return None


def source_url(rec: dict) -> str:
    """The page Vinnova itself pointed at for this round, preferring its own
    host. Falls back to the API record the text was literally read from --
    which is a real, resolvable citation, unlike a guessed call-page slug."""
    links = [ln.get("URL") for ln in (rec.get("LankLista") or []) if ln.get("URL")]
    own = [u for u in links if HOST in u]
    return (own or links or [f"{API}/ansokningsomgangar/{SINCE}"])[0]


def sentences(t: str) -> list[str]:
    parts = re.split(r"(?<=[.;:])\s+|\s+(?=[-–•])", t or "")
    return [p.strip() for p in parts if len(p.strip()) >= MIN_SENTENCE]


def own_share(text: str, others: list[str]) -> float:
    mine = sentences(text)
    if not mine:
        return 1.0 if text and text not in others else 0.0
    theirs = {norm(s) for o in others for s in sentences(o)}
    tot = sum(len(s) for s in mine) or 1
    return sum(len(s) for s in mine if norm(s) not in theirs) / tot


def rounds_by_programme(reg: dict[str, list[dict]]) -> dict[str, dict]:
    by_prog = defaultdict(list)
    for u in reg["utlysningar"]:
        if u.get("DiarienummerProgram"):
            by_prog[u["DiarienummerProgram"]].append(u)
    by_call = defaultdict(list)
    for a in reg["ansokningsomgangar"]:
        if a.get("DiarienummerUtlysning"):
            by_call[a["DiarienummerUtlysning"]].append(a)
    out = {}
    for p in reg["program"]:
        seen, rounds = set(), []
        calls = by_prog.get(p["Diarienummer"], [])
        for u in calls:
            refs = [u["Diarienummer"]] + [
                r.get("DiarienummerAnsokningsomgang") or r.get("Diarienummer")
                for r in (u.get("AnsokningsomgangDnrLista") or [])]
            for ref in refs:
                for a in by_call.get(ref, []):
                    key = a.get("Diarienummer")
                    if key not in seen:
                        seen.add(key)
                        rounds.append(a)
        out[norm(p.get("Titel"))] = rounds
    return out


def pick(rounds: list[dict], today: date):
    usable = [r for r in rounds if len(who_may_apply(r)) >= MIN_TEXT]
    if not usable:
        return None, None
    live = [r for r in usable if (closes(r) or date.min) >= today]
    if live:
        return min(live, key=lambda r: closes(r) or date.max), "open"
    return max(usable, key=lambda r: closes(r) or date.min), "past"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--regime", required=True,
                    help="parent_id of the regime whose leaves to resolve")
    ap.add_argument("--cache-dir", default=str(_Path(ROOT) / ".cache"))
    ap.add_argument("--refresh", action="store_true", help="refetch the registers")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--postgres", action="store_true",
                    help="mirror to Postgres -- the database the product reads")
    args = ap.parse_args()

    env()
    reg = registers(_Path(args.cache_dir), args.refresh)
    by_title = rounds_by_programme(reg)
    today = date.today()

    pg = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = pg.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""SELECT id, name, eligibility_text, scheme_end_date
                     FROM funding_instruments WHERE parent_id = %s""", (args.regime,))
    leaves = {r["id"]: dict(r) for r in cur.fetchall()}
    if not leaves:
        print("no leaves for that regime")
        return

    drafted: dict[str, tuple[str, str, dict]] = {}
    for iid, row in sorted(leaves.items()):
        if norm(row["eligibility_text"]):
            continue
        # A scheme the register says has closed cannot be proposed, so writing
        # application rules onto it would be writing rules nobody can use.
        if row["scheme_end_date"] and str(row["scheme_end_date"]) < today.isoformat():
            print(f"  skip     {iid:<46} register says closed "
                  f"{row['scheme_end_date']}")
            continue
        rounds = by_title.get(norm(row["name"]))
        if rounds is None:
            print(f"  no match {iid:<46} no programme titled {row['name']!r}")
            continue
        rec, kind = pick(rounds, today)
        if not rec:
            print(f"  no text  {iid:<46} {len(rounds)} rounds, none with "
                  f"a populated 'Vem kan söka?'")
            continue
        drafted[iid] = (who_may_apply(rec), kind, rec)

    updates = []
    now = datetime.now(timezone.utc)
    for iid, (text, kind, rec) in sorted(drafted.items()):
        others = [t for j, (t, _, _) in drafted.items() if j != iid]
        others += [leaves[j]["eligibility_text"] or "" for j in leaves
                   if j not in drafted and leaves[j]["eligibility_text"]]
        if norm(text) in {norm(o) for o in others}:
            print(f"  SHARED   {iid:<46} identical to a sibling's text; refused")
            continue
        share = own_share(text, others)
        if share < MIN_OWN_SHARE:
            print(f"  SHARED   {iid:<46} own_share {share:.2f}; refused")
            continue
        conf = "high" if kind == "open" else "medium"
        print(f"  write    {iid:<46} {len(text):>4} chars  {kind:<4} "
              f"closes {str(rec.get('Stangningsdatum'))[:10]}  conf {conf}")
        updates.append((text, source_url(rec), conf, now, iid))

    print(f"\n{len(leaves)} leaves; {len(updates)} to write")
    if not args.write:
        print("[dry run] nothing written -- pass --write (and --postgres)")
        return

    sq = sqlite3.connect(DB)
    sq.executemany("""UPDATE funding_instruments
                         SET eligibility_text = ?, eligibility_source_url = ?,
                             eligibility_confidence = ?, eligibility_fetched_at = ?
                       WHERE id = ?""",
                   [(t, u, c, w.isoformat(sep=" ", timespec="seconds"), i)
                    for t, u, c, w, i in updates])
    sq.commit()
    sq.close()
    print(f"sqlite: {len(updates)} rows")

    if args.postgres:
        w = pg.cursor()
        w.executemany("""UPDATE funding_instruments
                            SET eligibility_text = %s, eligibility_source_url = %s,
                                eligibility_confidence = %s, eligibility_fetched_at = %s
                          WHERE id = %s""", updates)
        pg.commit()
        print(f"postgres: {len(updates)} rows -- this is the one the product reads")
    else:
        print("postgres: NOT written. SQLite alone changes nothing a founder sees.")
    pg.close()


if __name__ == "__main__":
    main()
