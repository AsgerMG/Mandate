"""One body, one unit, one person: write `same_as` corrections (migration 047) for bodies the census
added that the hand-made map already held under another name. Dry run unless --apply.

    python3 capital/ETL/terms/load_same_as.py --database-url URL

Input: capital/reference/census/duplicate_pairs.csv (judged pairs: census_key, original_key,
verdict same|different). For every SAME pair the census body becomes an alias of the original;
then their units are aligned TOP-DOWN: a census unit is the same as an original unit only when
their parents are already aligned and their names match exactly (case, accents and punctuation
ignored), so "(II)" in two different directorates never pairs them. Insert-only; no row deleted.
No model, no API credits.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import psycopg  # noqa: E402

PAIRS = REPO / "capital" / "reference" / "census" / "duplicate_pairs.csv"
MIGRATIONS = REPO / "capital" / "ETL" / "schema" / "migrations"


def nm(s: str) -> str:
    """Case, accents, punctuation and a trailing abbreviation in brackets ignored: the org chart's
    "SERVICE DE LA COMPÉTITIVITÉ, DE L’INNOVATION ..." is the register's "Service de la compétitivité,
    de l'innovation ... (SCIDE)"."""
    s = re.sub(r"\s*\([A-Za-z0-9&\-]{2,12}\)\s*$", "", s or "")
    return re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()).strip()


def abbrevs(s: str) -> set[str]:
    """Abbreviations a name carries: in brackets or after a comma inside them, 3-8 capitals, not a
    roman numeral ("(DGE)", "(..., DG Trésor)" gives none: two words)."""
    found = re.findall(r"[(,]\s*([A-Z][A-Z0-9&]{2,7})\s*[),]", s or "")
    return {x.lower() for x in found if not re.fullmatch(r"[IVXL]+", x)}


def same_unit_twice(con, name: dict[str, str], aliased: set[str]) -> list[tuple[str, str, str]]:
    """Units the graph holds twice, by two properties (24 Nov: 257 pairs, the same person shown twice):
    (1) the SAME REGISTER ENTRY loaded twice: a unit with two parents in the register (a secretariat
        shared by two ministries) was inserted under each. Definitive, whatever the names.
    (2) the same unit read from TWO PAGES OF ONE BODY (Bpifrance's executive-committee chart and its
        innovation page; an EU DG's chart code and the register's name): same top-level body, same
        name (digits kept: "4th Wing" is not "61st Wing"), and the same person in the same role.
        The same person in two DIFFERENT bodies is not a duplicate (one officer serving several
        commissarial bodies holds several real posts), so (2) never pairs across bodies.
    Each group's canonical unit is its first recorded; the others become its aliases, never chained."""
    def nm_d(x: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", unicodedata.normalize("NFKD", x or "").encode("ascii", "ignore").decode().lower()).strip()
    order = {k: i for k, i in con.execute("SELECT key, id FROM institutions")}
    groups: list[tuple[list[str], str]] = []
    by_entry: dict[tuple, list[str]] = {}
    for k, url, rid in con.execute("SELECT key, split_part(citations->0->>'url', '/', 3), citations->0->>'register_id' "
                                   "FROM institutions WHERE citations->0 ? 'register_id'"):
        by_entry.setdefault((url, rid), []).append(k)
    groups += [(ks, "the same register entry, loaded under two parents") for ks in by_entry.values() if len(ks) > 1]
    people: dict[tuple, list[str]] = {}
    for k, holder, role in con.execute("SELECT DISTINCT institution_key, holder_name, lower(role) FROM stakeholders "
                                       "WHERE holder_name IS NOT NULL AND holder_name <> ''"):
        if k in name:
            top = ".".join(k.split(".")[:2])
            people.setdefault((top, nm_d(name[k]), holder, role), []).append(k)
    groups += [(sorted(set(ks)), f"the same unit name and the same person ({h}, {r}) in one body")
               for (_, _, h, r), ks in people.items() if len(set(ks)) > 1]
    # union the groups, so a unit in two groups never becomes an alias of an alias
    root: dict[str, str] = {}
    def find(x: str) -> str:
        while root.get(x, x) != x:
            x = root[x]
        return x
    why: dict[frozenset, str] = {}
    for ks, reason in groups:
        for k in ks[1:]:
            a, b = find(ks[0]), find(k)
            if a != b:
                root[max(a, b, key=lambda z: order.get(z, 0))] = min(a, b, key=lambda z: order.get(z, 0))
            why.setdefault(frozenset((ks[0], k)), reason)
    out = []
    for k in root:
        canon = find(k)
        if k != canon and k not in aliased and canon not in aliased:
            reason = next((r for pair, r in why.items() if k in pair), "same unit")
            out.append((k, canon, reason))
    return out


def migrate(con) -> str:
    have = {r[0] for r in con.execute("SELECT id FROM schema_migrations").fetchall()}
    if "047" in have:
        return "047 already applied"
    con.execute("SELECT pg_advisory_xact_lock(hashtext('capital.schema_migrations'))")
    con.execute(next(MIGRATIONS.glob("047_*.sql")).read_text())
    con.execute("INSERT INTO schema_migrations (id) VALUES ('047')")
    return "047 applied (or would be, in a dry run)"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--all", action="store_true", help="list every correction")
    a = ap.parse_args()
    pairs = [(r["census_key"], r["original_key"]) for r in csv.DictReader(PAIRS.open()) if r["verdict"].strip().lower() == "same"]
    with psycopg.connect(a.database_url) as con:
        con.execute("SET search_path = capital, public")
        print(" ", migrate(con))
        rows = con.execute("SELECT key, parent_key, name FROM institutions").fetchall()
        kids: dict[str, list] = {}
        name = {}
        parent: dict[str, str] = {}
        for k, p, n in rows:
            name[k] = n
            if p:
                parent[k] = p
            if p:
                kids.setdefault(p, []).append(k)
        # how often a name / an abbreviation occurs in the whole graph: a generic name ("human resources
        # department", "finance") recurs everywhere and pairs nothing (24 Nov: INSEE's HR department
        # was paired with the DGE secretariat's); only a name seen at most twice (once per source) pairs
        freq: dict[str, int] = {}
        ab_freq: dict[str, int] = {}
        for k, n in name.items():
            freq[nm(n)] = freq.get(nm(n), 0) + 1
            for x in abbrevs(n):
                ab_freq[x] = ab_freq.get(x, 0) + 1
        held = {r[0] for r in con.execute("SELECT row_key FROM graph_corrections WHERE table_name = 'institutions' AND column_name = 'same_as'")}
        out: list[tuple[str, str, str]] = []
        queue = [(c, o, "judged the same body (census duplicate review)") for c, o in pairs if c in name and o in name]
        def below(root: str) -> list[str]:
            out_, queue_ = [], list(kids.get(root, []))
            while queue_:
                k = queue_.pop(0)
                out_.append(k)
                queue_ += kids.get(k, [])
            return out_
        for c, o, why in queue:
            out.append((c, o, why))
            # within a body judged the same: a census unit is the same as an original unit when its
            # name occurs EXACTLY ONCE in the original body's whole tree (the two sources nest units
            # at different depths: DG -> unit vs DG -> directorate -> unit); a repeated name pairs nothing
            index: dict[str, list] = {}
            for k in below(o):
                index.setdefault(nm(name[k]), []).append(k)
            ab_index: dict[str, list] = {}
            for k in below(o):
                for x in abbrevs(name[k]):
                    ab_index.setdefault(x, []).append(k)
            census_ab: dict[str, list] = {}
            census_below = below(c)
            for ck in census_below:
                for x in abbrevs(name[ck]):
                    census_ab.setdefault(x, []).append(ck)
            eu = c.startswith("eu.")
            aligned = {c: o}
            for ck in census_below:   # parents before children (below() walks depth-first from the root)
                hits = index.get(nm(name[ck]), [])
                parent_ok = eu or (parent.get(ck) in aligned and parent.get(hits[0]) == aligned[parent.get(ck)] if hits else False)
                if len(hits) == 1 and hits[0] != ck and len(nm(name[ck])) > 3 and freq.get(nm(name[ck]), 0) <= 2 and parent_ok:
                    out.append((ck, hits[0], f"same name, unique in the tree of {o}" + ("" if eu else ", parents paired")))
                    aligned[ck] = hits[0]
                    continue
                # names in two languages (the DGE vs "General Directorate for Enterprise (..., DGE)"):
                # the same abbreviation, found exactly once in each tree
                for x in abbrevs(name[ck]):
                    if len(ab_index.get(x, [])) == 1 and len(census_ab.get(x, [])) == 1 and ab_index[x][0] != ck and ab_freq.get(x, 0) <= 2:
                        out.append((ck, ab_index[x][0], f"same abbreviation {x.upper()}, unique in both trees of {o}"))
                        aligned[ck] = ab_index[x][0]
                        break
        out += same_unit_twice(con, name, {x[0] for x in out} | held)
        new = [x for x in out if x[0] not in held]
        for c, o, why in new:
            con.execute("INSERT INTO graph_corrections (table_name, row_key, column_name, value, reason, citations, batch) "
                        "VALUES ('institutions', %s, 'same_as', %s, %s, '[]'::jsonb, 'same_as_2026_11') ON CONFLICT DO NOTHING",
                        (c, o, why))
        bodies = sum(1 for x in new if x[2].startswith("judged"))
        print(f"  same_as corrections: {len(new)} new ({bodies} bodies judged the same, {len(new) - bodies} units aligned under them), "
              f"{len(out) - len(new)} already held")
        for c, o, why in (new if "--all" in sys.argv else new[:12]):
            print(f"    {c} -> {o}  [{why}]")
        if not a.apply:
            con.rollback()
            print("DRY RUN: rolled back, nothing written. Add --apply to write (owner-approved).")
        else:
            print("APPLIED.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
