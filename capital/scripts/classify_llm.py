"""LLM sector classifier + provider bake-off (provider-pluggable).

The deterministic NACE classifier (classify.py) leaves ~17k companies
`unclassified` because they carry only a name, a country and a programme — no NACE,
no tags, no descriptive title. An LLM can sometimes infer the sector from the name
and context. This module does that, and first runs a **bake-off** so we choose the
provider/model by accuracy-per-dollar rather than sticker price.

Bake-off design — make it a fair test of the capability we actually need:
  * Ground truth = companies whose sector is grounded in a clear NACE code (the
    authoritative economic-activity signal), so we trust the label.
  * We hand the model name + country + project text ONLY, with the NACE string
    WITHHELD — the same name/context-only inference required for the no-signal
    companies. A model that recovers the NACE-grounded sector from name alone is
    one we can trust on the companies that have nothing else.
  * Score agreement vs ground truth; report accuracy + measured token cost per
    provider.

Providers: `openai`, `anthropic`. Keys are read from the environment (this module
also loads ./.env.local if present). No key is ever written to a tracked file.

Usage:
  python3 scripts/classify_llm.py bakeoff --n 200 \
      --providers openai,anthropic \
      --openai-model gpt-4o-mini --anthropic-model claude-haiku-4-5
"""
from __future__ import annotations

import argparse
import os
import random
import sqlite3
import sys
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "db.sqlite"
sys.path.insert(0, str(ROOT / "scripts"))
from classify import _classify_by_nace  # noqa: E402

SECTORS = ["life_sciences", "cleantech", "deeptech_hardware", "digital",
           "space", "defense", "other", "unclassified"]
TECH_SECTORS = {"life_sciences", "cleantech", "deeptech_hardware", "digital",
                "space", "defense"}

# (input $/MTok, output $/MTok) at standard (non-batch) rates. Batch halves both.
# Verify current prices; override models via CLI if these IDs are stale.
PRICES = {
    "claude-haiku-4-5": (1.00, 5.00),
    "gpt-4o-mini":      (0.15, 0.60),
    "gpt-4.1-nano":     (0.10, 0.40),
    "gpt-5-nano":       (0.05, 0.40),
}

SYSTEM_PROMPT = (
    "You classify a company into exactly one sector based on WHAT THE COMPANY "
    "DOES (its core business), not on any single project or grant.\n\n"
    "Sectors:\n"
    "- life_sciences: pharma, biotech, medical devices, health, diagnostics\n"
    "- cleantech: energy, renewables, water, waste/recycling, decarbonisation, "
    "environmental tech\n"
    "- deeptech_hardware: electronics, semiconductors, machinery, robotics, "
    "advanced materials, photonics\n"
    "- digital: software, IT services, data, cloud, telecom, AI software, fintech\n"
    "- space: spacecraft, satellites, launch, earth observation\n"
    "- defense: military, defence systems, dual-use security\n"
    "- other: anything real but outside the above (food, construction, retail, "
    "logistics, consumer goods, agriculture, generic services)\n"
    "- unclassified: ONLY when the name and context give no usable signal at all\n\n"
    "Reply with EXACTLY ONE of these labels, lowercase, nothing else."
)


def load_env() -> None:
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def user_prompt(name: str, country: str, titles: list[str], sources: list[str],
                nace: list[str] | None = None) -> str:
    parts = [f"Company name: {name}", f"Country: {country or 'unknown'}"]
    if nace:
        parts.append("Reported economic-activity codes (NACE):\n- " + "\n- ".join(nace[:4]))
    if titles:
        parts.append("Funded project titles:\n- " + "\n- ".join(titles[:3]))
    if sources:
        fams = sorted({s.split("_")[0] for s in sources if s})[:6]
        parts.append("Funding programmes: " + ", ".join(fams))
    parts.append("\nWhat sector is this company? Reply with one label.")
    return "\n".join(parts)


# Internet-verified ground truth (hand-checked via web search 2026-06-16).
# Keyed by canonical_name. Used to measure REAL accuracy of rules + LLMs, rather
# than scoring models against our own (imperfect) labels. See docs/llm_eval.md.
TRUTH = {
    "MASH MAKES A S": "cleantech",            # biowaste -> biofuel/biochar/carbon
    "Ossiform ApS": "life_sciences",          # 3D-printed bone implants
    "Capturi A/S": "digital",                 # conversational-AI software
    "PROCOPE MEDICALS": "life_sciences",      # artificial heart (medtech)
    "NanoSanguis S.A.": "life_sciences",      # artificial blood
    "ETICAS DATA SOCIETY": "digital",         # AI ethics / data auditing
    "STRGY AI Oy": "digital",                 # AI strategy software / IT
    "Cense Analytics Oy": "cleantech",        # soil-carbon measurement / environmental
    "COPNER BIOTECH": "life_sciences",        # 3D bioprinting / cell culture
    "Holland Bioproducts B.V.": "other",      # horticulture grow media (agri)
    "SARUS TECHNOLOGIES": "digital",          # privacy-preserving data/ML software
    "GENCOM SRL": "digital",                  # IT solutions / consulting
    "STACK BY ME": "digital",                 # fintech investing app
    "CE.VI.V. S.R.L.": "other",               # winemaking / vineyard
    "DRÅPEN FJORDBAD": "other",               # sauna / wellness
    "LIOGIER PIERRE": "other",                # hand tools for wood/stone
    "HERIOT WATT UNIVERSITY THE": "other",    # university (research org)
    "GEOLOGIAN TUTKIMUSKESKUS": "other",      # Geological Survey of Finland (research)
    "APJ INDUSTRIA GRAFICA SL": "other",      # graphic/printing industry
}


def parse_label(text: str) -> str:
    t = (text or "").strip().lower()
    for s in SECTORS:               # exact / prefix
        if t == s or t.startswith(s):
            return s
    for s in SECTORS:               # substring fallback
        if s in t:
            return s
    return "unclassified"


def ground_truth_sample(conn: sqlite3.Connection, n: int) -> list[dict]:
    """Companies whose sector is grounded in a clear NACE hit; NACE withheld from
    the evidence we hand the model. Balanced across the tech sectors."""
    rows = conn.execute("""
        SELECT c.id, c.canonical_name, c.country, c.sector_inferred,
               GROUP_CONCAT(e.sector_tags_raw, '||') tags,
               GROUP_CONCAT(COALESCE(e.project_title,''), '||') titles,
               GROUP_CONCAT(e.source, '||') sources
        FROM companies c JOIN public_funding_events e ON e.company_id = c.id
        WHERE c.sector_inferred IN ('life_sciences','cleantech','deeptech_hardware',
                                    'digital','space','defense')
        GROUP BY c.id
    """).fetchall()
    by_sector: dict[str, list[dict]] = defaultdict(list)
    for cid, name, country, sec, tags, titles, sources in rows:
        # confirm a NACE descriptor independently maps to this sector
        nace_hit = None
        for t in (tags or "").split("||"):
            h = _classify_by_nace(t)
            if h in TECH_SECTORS:
                nace_hit = h
                break
        if nace_hit != sec:
            continue
        ttls = [t.strip() for t in (titles or "").split("||") if t.strip()]
        srcs = [s for s in (sources or "").split("||") if s]
        by_sector[sec].append({"id": cid, "name": name, "country": country,
                               "truth": sec, "titles": ttls, "sources": srcs})
    random.seed(42)
    per = max(1, n // len(by_sector)) if by_sector else n
    sample: list[dict] = []
    for sec, items in by_sector.items():
        random.shuffle(items)
        sample.extend(items[:per])
    random.shuffle(sample)
    return sample[:n]


# ── provider backends ────────────────────────────────────────────────────────

def call_openai(client, model: str, system: str, user: str):
    r = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
    )
    return r.choices[0].message.content, r.usage.prompt_tokens, r.usage.completion_tokens


def call_anthropic(client, model: str, system: str, user: str):
    r = client.messages.create(
        model=model, max_tokens=16, system=system,
        messages=[{"role": "user", "content": user}],
    )
    text = next((b.text for b in r.content if b.type == "text"), "")
    return text, r.usage.input_tokens, r.usage.output_tokens


def run_provider(name: str, model: str, sample: list[dict]) -> dict:
    if name == "openai":
        from openai import OpenAI
        client = OpenAI()
        caller = call_openai
    elif name == "anthropic":
        import anthropic
        client = anthropic.Anthropic()
        caller = call_anthropic
    else:
        raise SystemExit(f"unknown provider {name}")

    correct = 0
    in_tok = out_tok = 0
    errors = 0
    confusion: Counter = Counter()

    def classify(item):
        up = user_prompt(item["name"], item["country"], item["titles"], item["sources"])
        text, it, ot = caller(client, model, SYSTEM_PROMPT, up)
        return item, parse_label(text), it, ot

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(classify, it) for it in sample]
        for f in as_completed(futs):
            try:
                item, pred, it, ot = f.result()
            except Exception as e:
                errors += 1
                if errors <= 3:
                    print(f"  [{name}] error: {e}")
                continue
            in_tok += it
            out_tok += ot
            if pred == item["truth"]:
                correct += 1
            else:
                confusion[(item["truth"], pred)] += 1

    n = len(sample) - errors
    pin, pout = PRICES.get(model, (None, None))
    cost_sample = None
    if pin is not None and n:
        cost_sample = (in_tok / 1e6 * pin) + (out_tok / 1e6 * pout)
    return {"provider": name, "model": model, "n": n, "errors": errors,
            "correct": correct, "acc": (correct / n if n else 0),
            "in_tok": in_tok, "out_tok": out_tok, "cost_sample": cost_sample,
            "confusion": confusion.most_common(6)}


def fmt_cost_full(res: dict, total_companies: int) -> str:
    if res["cost_sample"] is None or not res["n"]:
        return "n/a (unknown price for model)"
    per = res["cost_sample"] / res["n"]
    full_batch = per * total_companies * 0.5   # Batch API ~50% off
    return f"${res['cost_sample']:.4f} sample -> ~${full_batch:.2f} for all {total_companies:,} (batch)"


def bakeoff(args) -> None:
    load_env()
    conn = sqlite3.connect(DB)
    sample = ground_truth_sample(conn, args.n)
    total = conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
    conn.close()
    print(f"Ground-truth sample: {len(sample)} companies "
          f"(NACE-grounded sector, NACE withheld from the model)\n")

    provs = [p.strip() for p in args.providers.split(",") if p.strip()]
    model_for = {"openai": args.openai_model, "anthropic": args.anthropic_model}
    keys = {"openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY"}

    results = []
    for p in provs:
        if not os.environ.get(keys[p]):
            print(f"  SKIP {p}: {keys[p]} not set\n")
            continue
        print(f"Running {p} ({model_for[p]}) over {len(sample)} companies...")
        results.append(run_provider(p, model_for[p], sample))

    if not results:
        sys.exit("No providers ran (no keys). Add keys to .env.local and retry.")

    print("\n=== BAKE-OFF RESULTS ===")
    print(f"{'provider':10} {'model':18} {'acc':>6} {'err':>4}  cost")
    for r in sorted(results, key=lambda r: -r["acc"]):
        print(f"{r['provider']:10} {r['model']:18} {r['acc']*100:5.1f}% {r['errors']:>4}  "
              f"{fmt_cost_full(r, total)}")
    for r in results:
        if r["confusion"]:
            print(f"\n{r['provider']} top confusions (truth -> predicted):")
            for (t, p), c in r["confusion"]:
                print(f"  {t:18} -> {p:18} {c}")
    print("\nPick by accuracy-per-dollar. The full run (chosen provider) goes via "
          "the Batch API as a follow-up step.")


def eval_truth(args) -> None:
    """Score rules + each LLM against INTERNET-verified ground truth (TRUTH)."""
    load_env()
    conn = sqlite3.connect(DB)
    items, rules_correct = [], 0
    for name, truth in TRUTH.items():
        row = conn.execute(
            """SELECT c.country, c.sector_inferred,
                      GROUP_CONCAT(e.sector_tags_raw,'||'),
                      GROUP_CONCAT(COALESCE(e.project_title,''),'||'),
                      GROUP_CONCAT(e.source,'||')
               FROM companies c JOIN public_funding_events e ON e.company_id=c.id
               WHERE c.canonical_name = ? GROUP BY c.id LIMIT 1""", (name,)).fetchone()
        if not row:
            print(f"  (skip, not found: {name})")
            continue
        country, rule_sec, tags, titles, sources = row
        nace = sorted({t.strip() for t in (tags or "").split("||")
                       if t.strip() and _classify_by_nace(t)})
        ttls = [t.strip() for t in (titles or "").split("||") if t.strip()]
        srcs = [s for s in (sources or "").split("||") if s]
        items.append({"name": name, "truth": truth, "country": country,
                      "rule": rule_sec, "nace": nace, "titles": ttls, "sources": srcs})
        if rule_sec == truth:
            rules_correct += 1
    conn.close()

    n = len(items)
    print(f"Internet-verified ground truth: {n} companies\n")
    print(f"{'RULES (classify.py)':24} accuracy: {rules_correct}/{n} = {100*rules_correct/n:.1f}%\n")

    provs = [p.strip() for p in args.providers.split(",") if p.strip()]
    model_for = {"openai": args.openai_model, "anthropic": args.anthropic_model}
    keys = {"openai": "OPENAI_API_KEY", "anthropic": "ANTHROPIC_API_KEY"}
    preds_by_prov = {}
    for p in provs:
        if not os.environ.get(keys[p]):
            print(f"  SKIP {p}: {keys[p]} not set")
            continue
        if p == "openai":
            from openai import OpenAI
            client, caller = OpenAI(), call_openai
        else:
            import anthropic
            client, caller = anthropic.Anthropic(), call_anthropic
        model = model_for[p]
        correct = 0
        preds = {}
        for it in items:
            up = user_prompt(it["name"], it["country"], it["titles"], it["sources"], it["nace"])
            try:
                text, _, _ = caller(client, model, SYSTEM_PROMPT, up)
                pred = parse_label(text)
            except Exception as e:
                pred = f"ERR:{e}"[:20]
            preds[it["name"]] = pred
            if pred == it["truth"]:
                correct += 1
        preds_by_prov[f"{p}:{model}"] = preds
        print(f"{p+':'+model:24} accuracy: {correct}/{n} = {100*correct/n:.1f}%")

    # per-company comparison table
    print(f"\n{'company':26} {'truth':14} {'rules':14} " +
          " ".join(f"{k.split(':')[0]:12}" for k in preds_by_prov))
    for it in items:
        mark = lambda v: ("OK " if v == it["truth"] else "xx ")
        line = f"{it['name'][:26]:26} {it['truth']:14} {mark(it['rule'])}{it['rule'][:11]:11} "
        for k in preds_by_prov:
            pv = preds_by_prov[k][it["name"]]
            line += f"{mark(pv)}{pv[:9]:9} "
        print(line)


# ── full / pilot classification → company_sector_llm table ───────────────────

def ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS company_sector_llm (
            company_id INTEGER PRIMARY KEY REFERENCES companies(id),
            sector TEXT NOT NULL, model TEXT NOT NULL, run_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
    conn.commit()


def select_companies(conn, pilot: int | None, limit: int | None, redo: bool) -> list[dict]:
    done = set() if redo else {r[0] for r in conn.execute(
        "SELECT company_id FROM company_sector_llm")}
    rows = conn.execute("""
        SELECT c.id, c.canonical_name, c.country,
               GROUP_CONCAT(e.sector_tags_raw,'||'),
               GROUP_CONCAT(COALESCE(e.project_title,''),'||'),
               GROUP_CONCAT(e.source,'||')
        FROM companies c JOIN public_funding_events e ON e.company_id=c.id
        GROUP BY c.id""").fetchall()
    items = []
    for cid, name, country, tags, titles, sources in rows:
        if cid in done:
            continue
        nace = sorted({t.strip() for t in (tags or "").split("||")
                       if t.strip() and _classify_by_nace(t)})
        items.append({"id": cid, "name": name, "country": country, "nace": nace,
                      "titles": [t.strip() for t in (titles or "").split("||") if t.strip()],
                      "sources": [s for s in (sources or "").split("||") if s]})
    random.seed(1)
    random.shuffle(items)
    if pilot:
        items = items[:pilot]
    elif limit:
        items = items[:limit]
    return items


def classify_sync(items, model, conn, run_id, workers=16) -> int:
    from openai import OpenAI
    client = OpenAI(max_retries=6, timeout=60)

    def one(it):
        up = user_prompt(it["name"], it["country"], it["titles"], it["sources"], it["nace"])
        text, _, _ = call_openai(client, model, SYSTEM_PROMPT, up)
        return it["id"], parse_label(text)

    written = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(one, it) for it in items]
        buf = []
        for f in as_completed(futs):
            try:
                cid, sec = f.result()
            except Exception as e:
                print(f"  err: {str(e)[:80]}")
                continue
            buf.append((cid, sec, model, run_id))
            if len(buf) >= 200:
                conn.executemany("INSERT OR REPLACE INTO company_sector_llm"
                                 "(company_id,sector,model,run_id) VALUES(?,?,?,?)", buf)
                conn.commit(); written += len(buf); buf = []
        if buf:
            conn.executemany("INSERT OR REPLACE INTO company_sector_llm"
                             "(company_id,sector,model,run_id) VALUES(?,?,?,?)", buf)
            conn.commit(); written += len(buf)
    return written


def classify_batch(items, model, conn, run_id, chunk=2500) -> int:
    """OpenAI Batch API (50% cheaper) for the full corpus. Chunk kept small so each
    batch stays under the org's enqueued-token cap (2M); batches run sequentially
    (we wait for each to finish), so the cap never stacks."""
    import json, time, io
    from openai import OpenAI
    client = OpenAI()
    written = 0
    for start in range(0, len(items), chunk):
        part = items[start:start + chunk]
        lines = []
        for it in part:
            up = user_prompt(it["name"], it["country"], it["titles"], it["sources"], it["nace"])
            lines.append(json.dumps({
                "custom_id": str(it["id"]), "method": "POST",
                "url": "/v1/chat/completions",
                "body": {"model": model, "max_tokens": 16, "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": up}]}}))
        f = client.files.create(file=io.BytesIO("\n".join(lines).encode()), purpose="batch")
        batch = client.batches.create(input_file_id=f.id, endpoint="/v1/chat/completions",
                                      completion_window="24h")
        print(f"  batch {start//chunk+1}: id={batch.id} ({len(part)} requests) submitted")
        while True:
            b = client.batches.retrieve(batch.id)
            if b.status in ("completed", "failed", "expired", "cancelled"):
                break
            print(f"    status={b.status} done={b.request_counts.completed}/{b.request_counts.total}")
            time.sleep(30)
        if b.status != "completed":
            print(f"  batch {batch.id} ended {b.status}; skipping")
            continue
        out = client.files.content(b.output_file_id).read().decode()
        buf = []
        for line in out.splitlines():
            if not line.strip():
                continue
            r = json.loads(line)
            cid = int(r["custom_id"])
            content = r["response"]["body"]["choices"][0]["message"]["content"]
            buf.append((cid, parse_label(content), model, run_id))
        conn.executemany("INSERT OR REPLACE INTO company_sector_llm"
                         "(company_id,sector,model,run_id) VALUES(?,?,?,?)", buf)
        conn.commit(); written += len(buf)
        print(f"  batch {batch.id} written: {len(buf)}")
    return written


def run(args) -> None:
    from datetime import datetime, timezone
    load_env()
    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY not set (add to .env.local)")
    conn = sqlite3.connect(DB)
    ensure_table(conn)
    items = select_companies(conn, args.pilot, args.limit, args.redo)
    print(f"To classify: {len(items)} companies via {args.mode} ({args.openai_model})")
    if not items:
        print("Nothing to do (all done; use --redo to reclassify)."); return
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    fn = classify_batch if args.mode == "batch" else classify_sync
    n = fn(items, args.openai_model, conn, run_id)
    total = conn.execute("SELECT COUNT(*) FROM company_sector_llm").fetchone()[0]
    print(f"\nWrote {n} this run; company_sector_llm now holds {total:,} labels.")
    conn.close()


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    bo = sub.add_parser("bakeoff", help="compare providers on NACE-grounded ground truth")
    bo.add_argument("--n", type=int, default=200)
    bo.add_argument("--providers", default="openai,anthropic")
    bo.add_argument("--openai-model", default="gpt-4o-mini")
    bo.add_argument("--anthropic-model", default="claude-haiku-4-5")
    bo.set_defaults(func=bakeoff)
    ev = sub.add_parser("eval", help="score rules + LLMs vs internet-verified truth")
    ev.add_argument("--providers", default="openai,anthropic")
    ev.add_argument("--openai-model", default="gpt-4o-mini")
    ev.add_argument("--anthropic-model", default="claude-haiku-4-5")
    ev.set_defaults(func=eval_truth)
    rn = sub.add_parser("run", help="classify companies -> company_sector_llm table")
    rn.add_argument("--mode", choices=["sync", "batch"], default="sync")
    rn.add_argument("--pilot", type=int, help="random sample of N (validation)")
    rn.add_argument("--limit", type=int, help="cap to first N selected")
    rn.add_argument("--redo", action="store_true", help="reclassify even if already done")
    rn.add_argument("--openai-model", default="gpt-4.1-mini")
    rn.set_defaults(func=run)
    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
