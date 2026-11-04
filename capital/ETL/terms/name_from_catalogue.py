"""Name the funds whose feed never named them, from their own agency's catalogue.

── What is left, and why it is left ───────────────────────────────────────
71 same-named families were resolved for free from `programme_name` on their own
events. 82 remain, led by EIS (31) and Altum (25), whose feeds carry no
programme name at all. Their names exist only in the agency's catalogue.

── The standard: catalogue-backed or nothing ──────────────────────────────
A proposal is accepted ONLY if the name it proposes appears in that agency's
fetched catalogue -- as a link anchor or a page title. That is checked HERE, in
code, after the model answers. It is not left to the prompt, because a prompt
instruction is a request and this is a rule: the failure being prevented is a
plausible invented name on a real public fund, which a founder would carry into
a conversation with the agency.

So the model's job is matching, not naming. It sees the catalogue entries and
the instrument's own evidence (award volume, event count, sample project
titles), and picks which entry -- or none. Every accepted name carries the
catalogue URL it came from.

`--dry-run` writes the proposals with their evidence and applies nothing.

Cost: one call per AGENCY, not per fund. Measured at roughly 6,200 input and
4,900 output tokens for all 82 funds, about USD 0.09 on Sonnet 5.

Usage:
  python3 ETL/terms/name_from_catalogue.py propose [--agency altum] [--dry-run]
  python3 ETL/terms/name_from_catalogue.py apply
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

import argparse
import collections
import json
import os
import re
import sqlite3
import unicodedata

_sys.path.insert(0, str(_Path(__file__).resolve().parent))
from seed_agency_routes import AGENCIES  # noqa: E402

MANIFEST = ROOT / "data" / "raw" / "agency_catalogues" / "manifest.json"
PROPOSALS = ROOT / "reference" / "programme_names_proposed.json"
CURATED = ROOT / "reference" / "programme_names.json"

MODEL = "claude-sonnet-5"


def norm(s: str) -> str:
    """Fold case, accents and punctuation so a catalogue entry and a proposal
    compare on their substance. Latvian and Estonian names differ from their own
    catalogue by a diacritic often enough that a strict match would reject
    correct answers."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def catalogue_entries(agency_key: str, manifest: dict) -> list[dict]:
    """Every name the agency itself publishes for a PRODUCT, with its page.

    The raw anchors and titles are not usable as names, and the first pass
    proved it by accepting three bad ones: "Commercialisation Fund | Business
    Support | Enterprise Ireland" (title with the site suffix attached),
    "Directe financieringWe investeren in impactv..." (an anchor that swallowed
    the paragraph after it), and "SPRIND | Projekte" -- the site's own page
    title offered as though it were a fund. That last is exactly the failure
    this whole approach exists to avoid.

    Cleaned by measurable properties rather than a list of strings to drop,
    because a list would be wrong for the next agency:

      * A trailing segment after | - or the like that RECURS across many pages
        is the site's suffix, not part of any name. Detected by counting, so it
        works in Estonian and Latvian without knowing the words.
      * Text appearing on a large share of pages is navigation, not a product.
      * Text that is the index page's own title is the site, not a product.
    """
    pages = manifest.get(agency_key, {}).get("pages", [])
    if not pages:
        return []
    site_title = norm(next((p.get("title") or "" for p in pages
                            if p.get("file") == "index.html"), ""))

    SEP = re.compile(r"\s+[|\u2013\u2014\u00b7:]\s+")

    # A tail segment that recurs is a site suffix. Count before stripping.
    tails: collections.Counter = collections.Counter()
    for p in pages:
        for text in (p.get("anchor"), p.get("title")):
            parts = SEP.split(text or "")
            for t in parts[1:]:
                if norm(t):
                    tails[norm(t)] += 1
    suffix = {t for t, n in tails.items() if n >= 3}

    # Text repeated across pages is chrome. Two occurrences is not evidence;
    # a quarter of the pages is.
    freq: collections.Counter = collections.Counter()
    for p in pages:
        for text in (p.get("anchor"), p.get("title")):
            if norm(text or ""):
                freq[norm(text)] += 1
    chrome_floor = max(3, len(pages) // 4)

    out, seen = [], set()
    for p in pages:
        for text in (p.get("anchor"), p.get("title")):
            raw = (text or "").strip()
            if not raw:
                continue
            # An anchor that ran into the following prose: a name does not
            # contain a sentence. Cut at the first lowercase-to-uppercase
            # collision only if the result is still substantial.
            parts = [x for x in SEP.split(raw) if norm(x) and norm(x) not in suffix]
            cleaned = parts[0].strip() if parts else ""
            if not cleaned or len(cleaned) > 90:
                continue
            n = norm(cleaned)
            if (len(n) < 8 or n in seen or n == site_title
                    or freq[norm(raw)] >= chrome_floor
                    or n in suffix):
                continue
            seen.add(n)
            out.append({"name": cleaned, "url": p.get("url", "")})
    return out


def funds_needing_names(conn: sqlite3.Connection) -> dict[str, list[sqlite3.Row]]:
    rows = conn.execute("""
        SELECT id, name, total_eur, event_count, sample_project_titles
        FROM funding_instruments WHERE parent_id IS NULL AND is_framework = 0
    """).fetchall()
    by_name: dict[str, list] = collections.defaultdict(list)
    for r in rows:
        by_name[r["name"]].append(r)
    # Keyed by the agency's OWN id prefix from seed_agency_routes, not by
    # splitting on the first underscore. `enterprise_ireland_hpsu` splits to
    # "enterprise", which matches no catalogue and silently skipped six funds
    # that had one on disk. The prefix is the agency's identity; guessing it
    # from the id is how they diverge.
    prefixes = sorted((a["match"].rstrip("%").rstrip("_") for a in AGENCIES),
                      key=len, reverse=True)
    out: dict[str, list] = collections.defaultdict(list)
    for group in by_name.values():
        if len(group) < 2:
            continue
        for r in group:
            key = next((p for p in prefixes if r["id"].startswith(p + "_")),
                       r["id"].split("_")[0])
            out[key].append(r)
    return out


def build_prompt(entries: list[dict], funds: list[sqlite3.Row]) -> str:
    cat = "\n".join(f"  [{i}] {e['name']}" for i, e in enumerate(entries))
    fl = []
    for r in funds:
        titles = (r["sample_project_titles"] or "")[:300]
        fl.append(f"  {r['id']}  EUR {(r['total_eur'] or 0)/1e6:.0f}M, "
                  f"{r['event_count']} awards. Sample funded projects: {titles}")
    return f"""These funds all display the same name, so a founder cannot tell them apart.
The agency's own catalogue is below. For each fund, choose the catalogue entry
that IS that fund, or null.

CATALOGUE ENTRIES
{cat}

FUNDS TO IDENTIFY
{chr(10).join(fl)}

Choose null unless the evidence genuinely identifies the fund. A wrong name on a
public fund is worse than no name: a founder will take it to the agency. The id
often encodes the agency's internal code rather than the product name, so read
the funded-project titles and the award scale as the primary evidence.

Reply with JSON only: {{"assignments": [{{"id": "...", "entry": <index or null>,
"why": "<one clause of evidence>"}}]}}"""


def propose(args) -> None:
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    needed = funds_needing_names(conn)
    curated = {k for k in json.loads(CURATED.read_text()) if not k.startswith("_")}

    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    proposals: dict[str, dict] = {}
    if PROPOSALS.exists():
        proposals = {k: v for k, v in json.loads(PROPOSALS.read_text()).items()
                     if not k.startswith("_")}
    accepted = rejected = skipped = 0

    for key, funds in sorted(needed.items(), key=lambda kv: -len(kv[1])):
        if args.agency and key != args.agency:
            continue
        funds = [f for f in funds if f["id"] not in curated]
        entries = catalogue_entries(key, manifest)
        if not entries or not funds:
            print(f"{key:12} no catalogue on disk -- skipped ({len(funds)} funds keep "
                  f"their descriptor)")
            skipped += len(funds)
            continue

        prompt = build_prompt(entries, funds)
        if args.dry_run:
            print(f"{key:12} would send ~{len(prompt)//3:,} input tokens for "
                  f"{len(funds)} funds against {len(entries)} catalogue entries")
            continue

        msg = client.messages.create(
            model=MODEL, max_tokens=2000,
            messages=[{"role": "user", "content": prompt}])
        # content[0] is a ThinkingBlock when extended thinking is on, so index 0
        # is not reliably the answer. Take the first text block.
        text = next((b.text for b in msg.content if getattr(b, "type", "") == "text"), "")
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            print(f"{key:12} no JSON in reply -- nothing applied")
            continue
        data = json.loads(m.group(0))

        for a in data.get("assignments", []):
            idx = a.get("entry")
            if idx is None or not isinstance(idx, int) or not (0 <= idx < len(entries)):
                rejected += 1
                continue
            entry = entries[idx]
            # THE RULE, enforced here rather than in the prompt: the proposed
            # name must be one the agency itself publishes.
            if norm(entry["name"]) not in {norm(e["name"]) for e in entries}:
                rejected += 1
                continue
            proposals[a["id"]] = {"name": entry["name"], "source": entry["url"],
                                  "evidence": a.get("why", ""), "agency": key}
            accepted += 1
        print(f"{key:12} {len(funds)} funds, {len(entries)} entries -> "
              f"{sum(1 for a in data.get('assignments', []) if a.get('entry') is not None)} matched")

    if args.dry_run:
        return
    PROPOSALS.write_text(json.dumps(
        {"_comment": "Proposed by ETL/terms/name_from_catalogue.py. Every entry's "
                     "`name` is one the agency itself publishes; `source` is the page "
                     "it was read from. Nothing here is applied until it is promoted "
                     "into programme_names.json, which is the curated file the loader "
                     "reads.", **proposals}, ensure_ascii=False, indent=2) + "\n")
    print(f"\naccepted {accepted}, rejected {rejected}, skipped {skipped} "
          f"(no catalogue). Written to {PROPOSALS.relative_to(ROOT)}.")
    print("Nothing is live yet: promote entries into programme_names.json to apply.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["propose"])
    ap.add_argument("--agency")
    ap.add_argument("--dry-run", action="store_true")
    propose(ap.parse_args())


if __name__ == "__main__":
    main()
