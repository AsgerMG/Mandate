"""THE CENSUS, the network's people and units: for every graph-core body that carries a `register:`
reference in the knowledge map, its SUBTREE in the official register (directorates, offices, units,
each placed under its register parent, cited to the register) and the heads the register names for
the body and each unit, as stakeholders. Dry run unless --apply. (Owner: the right UNIT at the right
SENIORITY; the registers hold the units the org charts did not.)

    python3 capital/ETL/terms/load_register_heads.py --database-url URL --market FR

One stakeholder row per (body, role) the register names, cited to the stored register page (the
name as the quote), last_verified = the register load's date; a role whose holder is unchanged
adds nothing, a new holder is a new row (who moved is itself a signal). Public professional roles
only, names as the register prints them; no contact details. No model, no API credits.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO))
import psycopg  # noqa: E402
import yaml  # noqa: E402

MAP = REPO / "mandate" / "brains" / "wincent" / "knowledge_map.yaml"
MAX_HEADS = 12   # a register unit can list its whole staff (EU Whoiswho); the first listed are its heads


def role_slug(role: str) -> str:
    s = unicodedata.normalize("NFKD", role or "head").encode("ascii", "ignore").decode().lower()
    return (re.sub(r"[^a-z0-9]+", "_", s).strip("_") or "head")[:40]


def unit_key(parent_key: str, name: str, taken: set[str]) -> str:
    s = unicodedata.normalize("NFKD", name or "unit").encode("ascii", "ignore").decode().lower()
    words = [w for w in re.sub(r"[^a-z0-9]+", " ", s).split() if w not in {"de", "du", "des", "la", "le", "les", "et", "di", "del", "della", "e", "of", "and", "the", "for"}]
    k = f"{parent_key}.{'_'.join(words[:4])[:36] or 'unit'}"
    base, i = k, 2
    while k in taken:
        k, i = f"{base}_{i}", i + 1
    taken.add(k)
    return k


def subtree(con, register: str, root: str, market: str) -> list[tuple[str, str, str, list]]:
    """(register_id, parent_register_id, name, heads) below `root`, parents before children."""
    rows = con.execute("SELECT DISTINCT ON (register_id) register_id, name, parent_ids, child_ids, heads, citations "
                       "FROM register_entries WHERE register = %s ORDER BY register_id, recorded_at DESC", (register,)).fetchall()
    d = {r[0]: r for r in rows}
    kids: dict[str, list] = {}
    for rid, _, par, ch, _, _ in rows:
        for p in par or []:
            kids.setdefault(p, []).append(rid)
        for c in ch or []:
            kids.setdefault(rid, []).append(c)
    out, seen, queue = [], {root}, [root]
    while queue:
        cur = queue.pop(0)
        for c in sorted(set(kids.get(cur, []))):
            if c in d and c not in seen:
                seen.add(c)
                out.append((c, cur, d[c][1], d[c][4] or [], d[c][5]))
                queue.append(c)
    return out


def load(db_url: str, *, apply: bool, market: str, units: bool = True) -> tuple[dict, list[str]]:
    nodes = [n for n in yaml.safe_load(MAP.read_text())["markets"][market]["institutions"] if n.get("register")]
    report: list[str] = []
    new = same = moved = none = 0
    new_units = held_units = 0
    with psycopg.connect(db_url) as con:
        con.execute("SET search_path = capital, public")
        taken = {r[0] for r in con.execute("SELECT key FROM institutions")}
        # a subtree entry that is already a graph body (its own map entry, or the same name in this
        # market) is LINKED, never duplicated as a unit (BIST's subtree holds the British Business Bank)
        def nm(x: str) -> str:
            return re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", x or "").encode("ascii", "ignore").decode().lower()).strip()
        by_reg = {n["register"].split(":", 1)[1]: n["key"] for n in nodes}
        by_name = {nm(r[1]): r[0] for r in con.execute("SELECT key, name FROM institutions WHERE market = %s AND kind <> 'unit'", (market,))}
        unit_nodes = []
        if units:
            for n in nodes:
                reg, rid = n["register"].split(":", 1)
                keymap = {rid: n["key"]}
                for urid, prid, name, heads, cits in subtree(con, reg, rid, market):
                    held = by_reg.get(urid) or by_name.get(nm(name)) or (con.execute(
                        "SELECT key FROM institutions WHERE citations->0->>'register_id' = %s", (urid,)).fetchone() or [None])[0]
                    if held:
                        keymap[urid] = held
                        held_units += 1
                        continue
                    k = unit_key(keymap.get(prid, n["key"]), name, taken)
                    keymap[urid] = k
                    con.execute("""INSERT INTO institutions (key, parent_key, market, level, region, kind, name, name_local, role, website, citations, batch)
                                   VALUES (%s, %s, %s, %s, NULL, 'unit', %s, %s, NULL, NULL, %s::jsonb, %s)""",
                                (k, keymap.get(prid, n["key"]), market, n["level"], name, name,
                                 json.dumps([{**cits[0], "quote": name, "located": True, "register_id": urid}], ensure_ascii=False),
                                 f"register_units_{market.lower()}"))
                    new_units += 1
                    if heads:
                        unit_nodes.append({"key": k, "register": f"{reg}:{urid}"})
        for n in nodes + unit_nodes:
            reg, rid = n["register"].split(":", 1)
            row = con.execute("SELECT heads, citations, recorded_at::date FROM register_entries WHERE register = %s AND register_id = %s "
                              "ORDER BY recorded_at DESC LIMIT 1", (reg, rid)).fetchone()
            if not row or not row[0]:
                none += 1
                continue
            heads, cits, day = row
            seen: set[str] = set()
            for h in heads[:MAX_HEADS]:
                key = f"{n['key']}.{role_slug(h.get('role'))}"
                if key in seen:     # two people with the same role: number them
                    i = 2
                    while f"{key}_{i}" in seen:
                        i += 1
                    key = f"{key}_{i}"
                seen.add(key)
                last = con.execute("SELECT holder_name FROM stakeholders WHERE key = %s ORDER BY last_verified DESC, recorded_at DESC LIMIT 1",
                                   (key,)).fetchone()
                if last and last[0] == h["name"]:
                    same += 1
                    continue
                cit = {**cits[0], "quote": h["name"], "located": True, "association": "register_entry"}
                if h.get("appointment"):
                    cit["appointment"] = h["appointment"]
                con.execute("""INSERT INTO stakeholders (key, institution_key, role, holder_name, reach, last_verified, citations, batch)
                               VALUES (%s, %s, %s, %s, NULL, %s, %s::jsonb, %s)""",
                            (key, n["key"], h.get("role") or "head", h["name"], day, json.dumps([cit], ensure_ascii=False),
                             f"register_heads_{market.lower()}_{day:%Y_%m}"))
                if last:
                    moved += 1
                    report.append(f"  NEW HOLDER {key}: {last[0]} -> {h['name']}")
                else:
                    new += 1
        if not apply:
            con.rollback()
    return {"bodies with a register entry": len(nodes), "units from the registers": f"{new_units} new, {held_units} already held",
            "people": f"{new} new, {moved} new holders, {same} unchanged",
            "bodies whose register names no one": none}, report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--market", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    counts, report = load(a.database_url, apply=a.apply, market=a.market.upper())
    print("\n".join(report[:30]))
    for k, v in counts.items():
        print(f"  {k:34} {v}")
    print("APPLIED." if a.apply else "DRY RUN: rolled back, nothing written. Add --apply to write (owner-approved).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
