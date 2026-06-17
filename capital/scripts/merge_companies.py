"""Parent-company resolution (rollup, NON-destructive).

Groups legal entities that share an ultimate parent — SAP SE / SAP Labs France;
Maersk A/S / A.P. Moller Maersk — under a `companies.parent_group` key. Rows are
NOT deleted: legal-entity granularity (country, IPCEI sister entities, per-country
coverage) is preserved, and "largest recipient" rolls up at query time.

Why not string matching: SAP / SAPA / SAPELI / SAPIENS are different firms, so a
fuzzy "similar prefix" rule fuses unrelated companies; and it can never span a
brand-vs-legal-name or a translation (Mærsk / Maersk / A.P. Møller). So:

  1. Scope to the TOP recipients by total funding (where rankings actually matter).
  2. Block by shared distinctive token (len >= 4, not a generic word); union those
     into connected components — candidate clusters of plausibly-related names.
  3. Ask gpt-4.1-mini, per cluster, which names share the SAME ultimate parent.
     It has the world knowledge to know A.P. Moller == Maersk; string rules don't.
  4. Write proposals to a CSV for human review (--dry-run, default). `--apply`
     then writes `parent_group` (the LLM-provided parent name, normalised).

Run AFTER classification + reconciliation. Reuses .env.local for OPENAI_API_KEY.
"""
from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "db.sqlite"
OUT = ROOT / "data" / "processed" / "parent_merge_proposals.csv"
sys.path.insert(0, str(ROOT / "scripts"))
from classify_llm import load_env  # noqa: E402

# generic tokens that must NOT be used for blocking (they connect unrelated firms)
GENERIC = {
    "group", "holding", "holdings", "international", "technology", "technologies",
    "solutions", "systems", "energy", "energia", "energie", "digital", "data",
    "labs", "research", "innovation", "industries", "industrie", "services",
    "global", "europe", "company", "limited", "consulting", "engineering",
    "software", "medical", "pharma", "bio", "tech", "smart", "green", "nova",
    # geographic / nationality tokens — over-bridge unrelated firms ("...France")
    "france", "francaise", "deutschland", "german", "germany", "italia", "italy",
    "italiana", "espana", "espanola", "spain", "nederland", "netherlands", "belgium",
    "europa", "european", "nordic", "iberica", "hellas", "polska", "suomi",
    "paris", "berlin", "madrid", "milano", "milan", "london", "wien", "vienna",
    "munchen", "munich", "roma", "lisboa", "scandinavia", "benelux", "uk", "usa",
    # very common org words
    "national", "nazionale", "nationale", "centre", "center", "centro", "zentrum",
    "institute", "institut", "istituto", "gesellschaft", "associazione", "stichting",
    "fondation", "fondazione", "fundacion", "foundation", "ventures", "capital",
    "partners", "advanced", "industrial", "industriale", "automation", "products",
    # geographic / descriptor words that are NOT a parent brand — must not be used
    # to anchor corpus-wide expansion (they bridge unrelated firms)
    "noord", "zuid", "oost", "west", "nord", "sud", "est", "ouest", "north",
    "south", "energo", "scale", "wandpark", "windpark", "solarpark", "biogas",
    "meyer", "park", "kraft", "warmte", "energi", "energia",
    # legal-form tokens (3+ chars) — at a 3-char blocking floor these would bridge
    # thousands of unrelated firms into giant components, so they must be excluded
    "gmbh", "mbh", "ggmbh", "sas", "sasu", "sarl", "srl", "srls", "spa", "scpa",
    "snc", "sro", "spol", "llc", "llp", "inc", "corp", "ltd", "plc", "kft", "zrt",
    "nyrt", "doo", "aps", "asa", "oyj", "bvba", "sprl", "scrl", "kgaa", "sau",
    "slu", "sll", "scs", "sca", "sccl", "unip", "lda", "ltda", "und", "der", "des",
    "the", "and", "for", "com", "von", "van", "den", "los", "las", "kgaa",
}
MODEL = "gpt-4.1-mini"


def norm_tokens(name: str) -> list[str]:
    import re, unicodedata
    s = unicodedata.normalize("NFKD", name).encode("ASCII", "ignore").decode()
    s = re.sub(r"[^a-z0-9 ]+", " ", s.lower())
    # 3-char floor catches abbreviation brands (SAP, BMW, ABB); legal forms are
    # excluded via GENERIC so they don't bridge unrelated firms.
    return [t for t in s.split() if len(t) >= 3 and t not in GENERIC]


def top_recipients(conn, limit: int) -> list[dict]:
    rows = conn.execute("""
        SELECT c.id, c.canonical_name, c.country,
               COALESCE(SUM(COALESCE(v.grant_amount_eur,0)+COALESCE(v.debt_amount_eur,0)
                            +COALESCE(v.equity_amount_eur,0)),0) AS eur
        FROM companies c JOIN v_events v ON v.company_id=c.id
        WHERE c.entity_type='company'
        GROUP BY c.id ORDER BY eur DESC LIMIT ?""", (limit,)).fetchall()
    return [{"id": r[0], "name": r[1], "country": r[2], "eur": r[3]} for r in rows]


def all_companies(conn) -> list[dict]:
    """Every company with funding events — full-corpus scope for the merge."""
    rows = conn.execute("""
        SELECT c.id, c.canonical_name, c.country,
               COALESCE(SUM(COALESCE(v.grant_amount_eur,0)+COALESCE(v.debt_amount_eur,0)
                            +COALESCE(v.equity_amount_eur,0)),0) AS eur
        FROM companies c JOIN v_events v ON v.company_id=c.id
        GROUP BY c.id""").fetchall()
    return [{"id": r[0], "name": r[1], "country": r[2], "eur": r[3]} for r in rows]


def process_clusters(client, comps, model, workers=12, rpm=460):
    """Concurrent + RPM-paced LLM grouping over many clusters (stays under the
    500 req/min ceiling). Returns flat list of groups."""
    import threading, time
    from concurrent.futures import ThreadPoolExecutor, as_completed
    interval = 60.0 / max(1, rpm)
    lock = threading.Lock(); nxt = [time.monotonic()]

    def pace():
        with lock:
            now = time.monotonic(); s = max(nxt[0], now); nxt[0] = s + interval; w = s - now
        if w > 0:
            time.sleep(w)

    def work(c):
        pace()
        groups, _, _ = llm_group(client, c, model)
        return groups

    out, errs = [], 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for f in as_completed([ex.submit(work, c) for c in comps]):
            try:
                out.extend(f.result())
            except Exception as e:
                errs += 1
                if errs <= 3:
                    print(f"  cluster err: {str(e)[:80]}")
    if errs:
        print(f"  ({errs} cluster errors; rerun to retry)")
    return out


MAX_DF = 80   # a token shared by more than this many firms is a common word, not a brand


def components(items: list[dict]) -> list[list[dict]]:
    """Per-token blocking (NO union-find): each distinctive token defines one
    candidate cluster = the companies that carry it. No transitive chaining, so
    no giant blob. A company may appear in a few clusters; the LLM confirms
    matches within each and first-confirmed-parent wins downstream. A token shared
    by 2..MAX_DF companies is a usable brand signal; above MAX_DF it's a common
    word and is dropped."""
    by_token: dict[str, list[int]] = defaultdict(list)
    for idx, it in enumerate(items):
        for t in set(norm_tokens(it["name"])):
            by_token[t].append(idx)
    seen: set[tuple] = set()
    out: list[list[dict]] = []
    for idxs in by_token.values():
        if not (2 <= len(idxs) <= MAX_DF):
            continue
        key = tuple(sorted(idxs))
        if key in seen:        # dedupe identical clusters (two tokens, same members)
            continue
        seen.add(key)
        out.append([items[i] for i in idxs])
    return out


def llm_group(client, cluster: list[dict], model: str) -> list[dict]:
    """Ask the model which names share an ultimate parent. Returns groups:
    [{"parent": str, "members": [name,...]}]; singletons omitted."""
    listing = "\n".join(f'{i}. {c["name"]} ({c["country"]})' for i, c in enumerate(cluster))
    sys_p = ("You are an entity-resolution expert. Given company names, group ONLY "
             "those that share the SAME ULTIMATE PARENT company (subsidiaries, legal "
             "variants, brand vs legal name, or translations/spellings count as the "
             "same parent; merely similar or same-industry names do NOT). Return "
             'JSON: {"groups":[{"parent":"<short canonical parent name>","members":[<indices>]}]}'
             " Only include groups with 2+ members. Omit companies that stand alone.")
    r = client.chat.completions.create(
        model=model,
        temperature=0,   # deterministic — merges must be reproducible, not stochastic
        max_tokens=800,  # JSON for up to ~80 members; without it OpenAI reserves the large default vs TPM
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": sys_p},
                  {"role": "user", "content": listing}],
    )
    pt, ct = r.usage.prompt_tokens, r.usage.completion_tokens
    try:
        data = json.loads(r.choices[0].message.content)
    except Exception:
        return [], pt, ct
    out = []
    for g in data.get("groups", []):
        members = [cluster[i] for i in g.get("members", [])
                   if isinstance(i, int) and 0 <= i < len(cluster)]
        if len(members) >= 2:
            out.append({"parent": g.get("parent", "").strip() or members[0]["name"],
                        "members": members})
    return out, pt, ct


# ── Merge accuracy eval: pairwise precision/recall/F1 vs hand-verified truth ──
# Each entry: (members, true_merge_groups). true_merge_groups lists the index sets
# that share an ULTIMATE PARENT; members not in any group are singletons (no merge).
# Hand-verified from the candidate clusters. Mixes clean merges (recall) with
# false-bridge traps (precision): "biotech"/"cementos" share a word but are
# unrelated firms; John Cockerill != John Deere; Gestamp sweeps in Vigo/Levante.
PRICES_MERGE = {"gpt-4o-mini": (0.15, 0.60), "gpt-4.1-mini": (0.40, 1.60),
                "gpt-4.1": (2.00, 8.00), "gpt-4o": (2.50, 10.00)}
TRUTH_SETS = [
    (["STMICROELECTRONICS FRANCE", "STMICROELECTRONICS CROLLES 2", "STMICROELECTRONICS",
      "STMICROELECTRONICS ROUSSET", "STMICROELECTRONICS GRENOBLE 2", "STMICROELECTRONICS ALPS",
      "STMICROELECTRONICS SA", "STMICROELECTRONICS (TOURS) SAS"], [[0, 1, 2, 3, 4, 5, 6, 7]]),
    (["Renault", "RENAULT ESPAÑA S.A.", "RENAULT ESPAÑA, S.A."], [[0, 1, 2]]),
    (["REPSOL EXPLORACION SA", "REPSOL SA", "REPSOL, S.A."], [[0, 1, 2]]),
    (["NAVANTIA, S.A., S.M.E", "NAVANTIA SA, SME", "NAVANTIA S.A., S.M.E."], [[0, 1, 2]]),
    (["Atos", "ATOS IT SOLUTIONS AND SERVICES IBERIA", "ATOS ITALIA S.P.A."], [[0, 1, 2]]),
    (["Sanofi FR", "SANOFI S.R.L."], [[0, 1]]),
    (["ASML", "ASML Netherlands B.V."], [[0, 1]]),
    (["ARKEMA FRANCE SA", "Arkema"], [[0, 1]]),
    (["STELLANTIS ESPAÑA SL", "STELLANTIS ESPA¿A, S.L."], [[0, 1]]),
    (["CAPGEMINI TECHNOLOGY SERVICES", "Capgemini Engineering Deutschland S.A.S. & Co. KG"], [[0, 1]]),
    (["WACKER CHEMIE AG", "Wacker"], [[0, 1]]),
    (["Elcogen", "AKTSIASELTS ELCOGEN"], [[0, 1]]),
    # false-bridge traps — NO merges (each its own company)
    (["CHERRY BIOTECH", "SOM INNOVATION BIOTECH SA", "IO BIOTECH APS", "MATER BIOTECH",
      "ACTICOR BIOTECH", "4MOVING BIOTECH", "NATAC BIOTECH"], []),
    (["Aalborg Portland A/S", "CEMENTOS PORTLAND VALDERRIVAS, S.A.",
      "CEMENTOS TUDELA VEGUÍN, S.A.", "CEMENTOS MOLINS INDUSTRIAL, S.A."], []),
    # mixed: Cockerills merge; John Deere does not
    (["John Cockerill (FR)", "John Cockerill (BE)", "JOHN DEERE SAS"], [[0, 1]]),
    # mixed: Gestamp entities merge; Vigo/Levante/Accionaplug are false bridges
    (["GESTAMP BIZKAIA, S.A.", "GESTAMP NAVARRA, SA", "GESTAMP ABRERA, S.A.",
      "GESTAMP LEVANTE, S.A.", "GESTAMP VIGO, S.A.", "Vigo", "LEVANTE SRL",
      "ACCIONAPLUG VALLE H2V NAVARRA SL"], [[0, 1, 2, 3, 4]]),
]


def _pairs(groups: list[list[int]]) -> set:
    out = set()
    for g in groups:
        for i in range(len(g)):
            for j in range(i + 1, len(g)):
                out.add(frozenset((g[i], g[j])))
    return out


def eval_merge(models: list[str]) -> None:
    load_env()
    import os
    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY not set (.env.local)")
    from openai import OpenAI
    client = OpenAI()
    n_truth_pairs = sum(len(_pairs(g)) for _, g in TRUTH_SETS)
    print(f"Merge eval: {len(TRUTH_SETS)} hand-verified clusters, "
          f"{n_truth_pairs} true same-parent pairs\n")
    print(f"{'model':16} {'precision':>10} {'recall':>8} {'F1':>7} {'TP':>4} {'FP':>4} {'FN':>4}  cost/1k-clusters")
    for model in models:
        TP = FP = FN = 0
        pt = ct = 0
        for members_names, true_groups in TRUTH_SETS:
            members = [{"name": nm, "country": "", "idx": i}
                       for i, nm in enumerate(members_names)]
            groups, p, c = llm_group(client, members, model)
            pt += p; ct += c
            pred_groups = [[m["idx"] for m in g["members"]] for g in groups]
            truth_pairs = _pairs(true_groups)
            pred_pairs = _pairs(pred_groups)
            TP += len(pred_pairs & truth_pairs)
            FP += len(pred_pairs - truth_pairs)
            FN += len(truth_pairs - pred_pairs)
        prec = TP / (TP + FP) if (TP + FP) else 1.0
        rec = TP / (TP + FN) if (TP + FN) else 1.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        pin, pout = PRICES_MERGE.get(model, (None, None))
        cost = (f"${(pt/1e6*pin + ct/1e6*pout) / len(TRUTH_SETS) * 1000:.2f}"
                if pin else "n/a")
        print(f"{model:16} {prec*100:9.1f}% {rec*100:7.1f}% {f1*100:6.1f}% "
              f"{TP:>4} {FP:>4} {FN:>4}  {cost}")
    print("\nPrecision is the one to optimise: a wrong merge corrupts rankings. "
          "FP = unrelated firms fused; FN = real parent links missed.")


def expand_groups(in_path: str, out_path: str, exclude_csv: str) -> None:
    """Complete each LLM-confirmed parent corpus-wide: for every group, find the
    distinctive name token its members share, then pull in ALL companies that
    carry that token (any funding level). Deterministic, no LLM. Fixes the
    partial-parent problem (top-3000 caught only a fraction of each parent)."""
    import csv as _csv
    from collections import defaultdict
    excl = {e.strip().lower() for e in exclude_csv.split(",") if e.strip()}
    groups, labels = defaultdict(list), {}
    for r in _csv.DictReader(open(in_path, encoding="utf-8")):
        if r["parent_label"].strip().lower() in excl or r["parent_group"].strip().lower() in excl:
            continue
        groups[r["parent_group"]].append(r["name"])
        labels[r["parent_group"]] = r["parent_label"]

    conn = sqlite3.connect(DB)
    comp = conn.execute("SELECT id, canonical_name FROM companies").fetchall()
    id2name = {cid: nm for cid, nm in comp}
    tokidx = defaultdict(list)
    for cid, nm in comp:
        for t in set(norm_tokens(nm)):
            tokidx[t].append(cid)

    assigned = {}            # company_id -> parent_group (first wins)
    name2id = {nm: cid for cid, nm in comp}
    for pg, names in groups.items():
        for nm in names:
            if nm in name2id:
                assigned[name2id[nm]] = pg

    summary = []
    for pg, names in groups.items():
        toksets = [set(norm_tokens(n)) for n in names]
        common = set.intersection(*toksets) if toksets else set()
        anchors = [t for t in common if len(t) >= 5]   # distinctive shared token(s)
        added = 0
        if anchors:
            cand = set()
            for a in anchors:
                cand.update(tokidx.get(a, []))
            for cid in cand:
                if cid in assigned:
                    continue
                if all(a in set(norm_tokens(id2name[cid])) for a in anchors):
                    assigned[cid] = pg
                    added += 1
        summary.append((labels[pg], len(names), added, ",".join(anchors) or "(no safe anchor)"))

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = _csv.writer(f)
        w.writerow(["parent_group", "parent_label", "company_id", "name"])
        for cid, pg in sorted(assigned.items(), key=lambda x: x[1]):
            w.writerow([pg, labels[pg], cid, id2name[cid]])
    conn.close()
    print(f"Expanded {len(groups)} parents -> {len(assigned)} entities (was "
          f"{sum(len(v) for v in groups.values())}). Per-parent additions:")
    for lbl, base, added, anchor in sorted(summary, key=lambda x: -x[2])[:25]:
        print(f"  +{added:>3}  {lbl[:30]:30} (base {base}, anchor='{anchor}')")
    print(f"\nWrote {out_path}")


def apply_from_csv(path: str, exclude_csv: str) -> None:
    """Deterministically write parent_group from a reviewed proposals CSV,
    skipping any flagged parent labels. No LLM calls — reproducible."""
    excl = {e.strip().lower() for e in exclude_csv.split(",") if e.strip()}
    conn = sqlite3.connect(DB)
    cols = [c[1] for c in conn.execute("PRAGMA table_info(companies)")]
    if "parent_group" not in cols:
        conn.execute("ALTER TABLE companies ADD COLUMN parent_group TEXT")
    rows, skipped = [], 0
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if (r["parent_label"].strip().lower() in excl
                    or r["parent_group"].strip().lower() in excl):
                skipped += 1
                continue
            rows.append((r["parent_group"], int(r["company_id"])))
    conn.executemany("UPDATE companies SET parent_group=? WHERE id=?", rows)
    conn.commit()
    groups = len({r[0] for r in rows})
    print(f"Applied parent_group to {len(rows)} companies in {groups} groups "
          f"(skipped {skipped} rows from excluded labels: {sorted(excl)}).")
    conn.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=3000, help="top recipients by EUR to scan")
    ap.add_argument("--full", action="store_true", help="scan the FULL corpus, not just top-N")
    ap.add_argument("--workers", type=int, default=12, help="concurrent cluster calls")
    ap.add_argument("--rpm", type=int, default=460, help="paced requests/min (under 500 limit)")
    ap.add_argument("--max-cluster", type=int, default=80, help="skip components larger than this")
    ap.add_argument("--model", default="gpt-4o-mini", help="OpenAI model (test cheap first)")
    ap.add_argument("--apply", action="store_true", help="write parent_group (default: dry-run CSV)")
    ap.add_argument("--eval", action="store_true", help="score models vs hand-verified truth")
    ap.add_argument("--models", default="gpt-4o-mini,gpt-4.1-mini",
                    help="comma list of models for --eval")
    ap.add_argument("--from-csv", help="apply parent_group from a reviewed proposals CSV (deterministic)")
    ap.add_argument("--expand", help="complete each confirmed parent corpus-wide from a proposals CSV (deterministic, no LLM)")
    ap.add_argument("--exclude", default="", help="comma list of parent labels to skip on apply")
    args = ap.parse_args()
    if args.eval:
        eval_merge([m.strip() for m in args.models.split(",") if m.strip()])
        return
    if args.expand:
        expand_groups(args.expand, "data/processed/parent_merge_proposals_expanded.csv", args.exclude)
        return
    if args.from_csv:
        apply_from_csv(args.from_csv, args.exclude)
        return
    load_env()
    import os
    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY not set (.env.local)")
    from openai import OpenAI
    client = OpenAI()

    conn = sqlite3.connect(DB)
    items = all_companies(conn) if args.full else top_recipients(conn, args.top)
    comps = [c for c in components(items) if 2 <= len(c) <= args.max_cluster]
    scope = "FULL corpus" if args.full else f"top {len(items)} recipients"
    print(f"Scanned {scope} ({len(items)} companies) -> {len(comps)} candidate clusters "
          f"(size 2..{args.max_cluster}); model={args.model}, {args.workers}w @ {args.rpm}rpm")

    groups = process_clusters(client, comps, args.model, workers=args.workers, rpm=args.rpm)
    proposals = []  # (parent, member_id, member_name, country, eur)
    for g in groups:
        pnorm = " ".join(norm_tokens(g["parent"])) or g["parent"].lower()
        for m in g["members"]:
            proposals.append((pnorm, g["parent"], m["id"], m["name"], m["country"], m["eur"]))

    groups = len({p[0] for p in proposals})
    print(f"Proposed: {groups} parent groups covering {len(proposals)} entities")

    if not args.apply:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        with OUT.open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["parent_group", "parent_label", "company_id", "name", "country", "eur"])
            for p in sorted(proposals):
                w.writerow(p)
        print(f"DRY RUN -> {OUT}\nReview, then re-run with --apply to write parent_group.")
        return

    cols = [c[1] for c in conn.execute("PRAGMA table_info(companies)")]
    if "parent_group" not in cols:
        conn.execute("ALTER TABLE companies ADD COLUMN parent_group TEXT")
    conn.executemany("UPDATE companies SET parent_group=? WHERE id=?",
                     [(p[0], p[2]) for p in proposals])
    conn.commit()
    print(f"Applied parent_group to {len(proposals)} companies in {groups} groups.")


if __name__ == "__main__":
    main()
