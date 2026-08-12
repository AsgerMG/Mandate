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

# ── The three-field card, and why only one of the three was ever read ───────
# Every Vinnova round publishes the same three-card block, and the API names
# them by TextID rather than by heading:
#
#   1  "Vad kan ni söka för?"   WHAT THE MONEY PAYS FOR
#   2  "Vem kan söka?"          WHO MAY APPLY
#   3  "Hur mycket kan ni söka?" the budget and the ceiling
#
# This loader read card 2 and walked past card 1, because it was written to
# raise `eligibility_text` and card 1 is not that. The consequence is measured:
# all 50 open Vinnova leaves now carry eligibility prose and NOT ONE carries a
# description, and Sweden is the single largest block of undescribed demand in
# the corpus -- 50 rows taking 3,329 places in a 256-founder replay of the real
# recall population, more than any other country. The ranker cannot choose
# between funds it cannot read, and card 1 is the sentence that makes them
# readable. It was one integer away the whole time, on a CC0 API this repo
# already fetches.
#
# Card 3 is deliberately still unread: the amount axis is `amount_min/max` and
# owning it from prose here would put a second, unreconciled source on a column
# another pass already fills.
WHAT_IT_FUNDS = 1      # TextID of the "Vad kan ni söka för?" card
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


def card(rec: dict, text_id: int) -> str:
    """One card of a round's three-field block, in Swedish, whitespace-squashed.

    Parameterised on TextID rather than duplicated per card: two copies of this
    reader would drift, and the copy that drifts is the one that silently stops
    returning text.
    """
    for w in rec.get("WebTextLista") or []:
        if w.get("TextID") == text_id:
            return re.sub(r"\s+", " ", (w.get("TextSv") or "")).strip()
    return ""


def who_may_apply(rec: dict) -> str:
    return card(rec, WHO_MAY_APPLY)


def what_it_funds(rec: dict) -> str:
    return card(rec, WHAT_IT_FUNDS)


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


def pick(rounds: list[dict], today: date, text_id: int = WHO_MAY_APPLY):
    """The round whose card `text_id` should speak for this programme.

    Asked PER CARD, not once for the programme. A round may publish "Vad kan ni
    söka för?" and leave "Vem kan söka?" empty, or the reverse -- 788 rounds
    carry the block at all and only 666 have a card 1 over the length floor. A
    single shared choice would silently inherit the other card's availability
    and refuse text that is sitting there.
    """
    usable = [r for r in rounds if len(card(r, text_id)) >= MIN_TEXT]
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
    cur.execute("""SELECT id, name, eligibility_text, description, scheme_end_date
                     FROM funding_instruments WHERE parent_id = %s""", (args.regime,))
    leaves = {r["id"]: dict(r) for r in cur.fetchall()}
    if not leaves:
        print("no leaves for that regime")
        return

    # ── One pass per CARD, keyed on the column that card fills ───────────────
    # The two axes are independent in both directions: a leaf may already carry
    # eligibility prose from an earlier run of this very script and still have
    # no description (all 50 open leaves are in exactly that state today), and a
    # round may publish one card and not the other. So "have we already got
    # this" is asked per column, and a run is idempotent on each separately.
    axes = (
        ("description", WHAT_IT_FUNDS, "Vad kan ni söka för?"),
        ("eligibility_text", WHO_MAY_APPLY, "Vem kan söka?"),
    )
    drafted: dict[str, dict[str, tuple[str, str, dict]]] = {c: {} for c, _, _ in axes}
    for column, text_id, heading in axes:
        print(f"\n── {column}  (card {text_id}, {heading!r}) ──")
        for iid, row in sorted(leaves.items()):
            if norm(row[column]):
                continue
            # A scheme the register says has closed cannot be proposed, so
            # writing its rules onto it would be writing rules nobody can use.
            # It applies to the description too: a sentence about what a dead
            # scheme funds is a sentence about a fund a founder cannot have.
            if row["scheme_end_date"] and str(row["scheme_end_date"]) < today.isoformat():
                print(f"  skip     {iid:<46} register says closed "
                      f"{row['scheme_end_date']}")
                continue
            rounds = by_title.get(norm(row["name"]))
            if rounds is None:
                print(f"  no match {iid:<46} no programme titled {row['name']!r}")
                continue
            rec, kind = pick(rounds, today, text_id)
            if not rec:
                print(f"  no text  {iid:<46} {len(rounds)} rounds, none with "
                      f"a populated {heading!r}")
                continue
            drafted[column][iid] = (card(rec, text_id), kind, rec)

    updates: dict[str, list[tuple]] = {c: [] for c, _, _ in axes}
    now = datetime.now(timezone.utc)
    for column, _, _ in axes:
        for iid, (text, kind, rec) in sorted(drafted[column].items()):
            # The boilerplate gate, unchanged in method and MORE load-bearing on
            # the description axis than on the eligibility one: `description` is
            # the column the semantic index embeds, so a description shared
            # across a regime does not merely fail to separate the leaves, it
            # gives the retriever fifty identical vectors to rank.
            others = [t for j, (t, _, _) in drafted[column].items() if j != iid]
            others += [leaves[j][column] or "" for j in leaves
                       if j not in drafted[column] and leaves[j][column]]
            if norm(text) in {norm(o) for o in others}:
                print(f"  SHARED   {column:<16} {iid:<46} identical to a sibling's; refused")
                continue
            share = own_share(text, others)
            if share < MIN_OWN_SHARE:
                print(f"  SHARED   {column:<16} {iid:<46} own_share {share:.2f}; refused")
                continue
            conf = "high" if kind == "open" else "medium"
            print(f"  write    {column:<16} {iid:<46} {len(text):>4} chars  {kind:<4} "
                  f"closes {str(rec.get('Stangningsdatum'))[:10]}  conf {conf}")
            updates[column].append((text, source_url(rec), conf, now, iid))

    n_desc, n_elig = len(updates["description"]), len(updates["eligibility_text"])
    print(f"\n{len(leaves)} leaves; {n_desc} descriptions and "
          f"{n_elig} eligibility texts to write")
    if not args.write:
        print("[dry run] nothing written -- pass --write (and --postgres)")
        return

    sq = sqlite3.connect(DB)
    sq.executemany("""UPDATE funding_instruments
                         SET eligibility_text = ?, eligibility_source_url = ?,
                             eligibility_confidence = ?, eligibility_fetched_at = ?
                       WHERE id = ?""",
                   [(t, u, c, w.isoformat(sep=" ", timespec="seconds"), i)
                    for t, u, c, w, i in updates["eligibility_text"]])
    # ── The description arm, deliberately its own statement ──────────────────
    # It must not stamp `eligibility_confidence` or `eligibility_fetched_at`:
    # those columns mean "we hold this scheme's own statement of WHO MAY APPLY,
    # at this confidence, fetched then", and card 1 is not that. Folding the two
    # together would record an eligibility fetch that never happened -- the same
    # defect load_scheme_text.py carried, one source over.
    sq.executemany("""UPDATE funding_instruments
                         SET description = ?,
                             eligibility_source_url = COALESCE(eligibility_source_url, ?)
                       WHERE id = ?""",
                   [(t, u, i) for t, u, _c, _w, i in updates["description"]])
    sq.commit()
    sq.close()
    print(f"sqlite: {n_elig} eligibility rows, {n_desc} description rows")

    if args.postgres:
        w = pg.cursor()
        w.executemany("""UPDATE funding_instruments
                            SET eligibility_text = %s, eligibility_source_url = %s,
                                eligibility_confidence = %s, eligibility_fetched_at = %s
                          WHERE id = %s""", updates["eligibility_text"])
        w.executemany("""UPDATE funding_instruments
                            SET description = %s,
                                eligibility_source_url = COALESCE(eligibility_source_url, %s)
                          WHERE id = %s""",
                      [(t, u, i) for t, u, _c, _w, i in updates["description"]])
        pg.commit()
        print(f"postgres: {n_elig} + {n_desc} rows -- this is the one the product reads")
    else:
        print("postgres: NOT written. SQLite alone changes nothing a founder sees.")
    pg.close()


if __name__ == "__main__":
    main()
