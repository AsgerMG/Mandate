"""The data-gap miner: which data would most improve the answers.

    PYTHONPATH=. python3 -m mandate.eval.data_gaps             # the ranked list, markdown
    PYTHONPATH=. python3 -m mandate.eval.data_gaps --json      # the same for the bench's Train view
    PYTHONPATH=. python3 -m mandate.eval.data_gaps --write     # also writes mandate/eval/data_asks.md

Every run leaves signals of missing data. This mines them, loads nothing, and
tells the owner which data earns its place (master plan rule 4b):

- the judge's `data_gaps` and `ungrounded_facts` in every judgement record
  (mandate/eval/judgements/*.json);
- the saved transcripts (runs/bench, runs/loop): claims labelled `(unverified)`,
  `[wN]` pages fetched live from official hosts a brain should hold, "none
  found" precedents, "register record" people, tool calls that came back empty;
- the owner's grade blocks: a `whats_off` or `edits` note about a missing fact;
- the usage log: `web/.bench/tool_calls.jsonl` (the bench's local copy) and,
  when a read-only URL is set and psycopg is installed, `mandate.tool_calls`
  in production: calls with result_count 0.

Signals are grouped into asks by kind and shared words; each ask carries how
many answers (runs) and how many owner cases it touched, the concrete source
named most often, and whether it is a one-off load, a feed, or better left to
live research. Re-runnable: the list refreshes as runs accumulate.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
JUDGEMENTS = HERE / "judgements"
RUN_DIRS = (HERE / "runs" / "bench", HERE / "runs" / "loop")
USAGE_LOCAL = REPO / "web" / ".bench" / "tool_calls.jsonl"
OUT_MD = HERE / "data_asks.md"

KINDS = ("statute", "instrument", "precedents", "stakeholders", "media", "other")
KIND_LABEL = {"statute": "statute / rule text", "instrument": "financial instrument intel", "precedents": "precedents",
              "stakeholders": "stakeholders / people", "media": "free media / news / agendas", "other": "other"}
# Property, not register: a host is "official statute" when it is a legal gazette or
# consolidated-law publisher; "official scheme" when it is a public bank, fund or
# institution publishing its own rules. The test is the host's role, not its name.
STATUTE_HOSTS = re.compile(r"eur-lex|legifrance|gesetze-im-internet|normattiva|gazzettaufficiale|wetten\.overheid|legislation\.gov|bundesrat|bundestag|senato|camera\.it|assemblee-nationale|consilium|europarl|oeil")
SCHEME_HOSTS = re.compile(r"\beif\.org|eib\.org|kfw|bpifrance|fondidigaranzia|mimit|invitalia|bancaditalia|bafin|acpr|banque-france|mcc\.it|simest|sace|ukef|british-business-bank|innovateuk|ec\.europa\.eu|europa\.eu")
# Which scenarios carry owner signal (a model answer or owner-written checkpoints).
OWNER_CASES = {"fintech_guarantees", "edtech_ai_kids", "robotics_deployment_it"}

LOAD_MODE = {
    "statute": "one-off load into grounding, monthly re-fetch (sha256 shows changes)",
    "instrument": "one-off load of the scheme's own rules and product sheets, weekly refresh",
    "precedents": "one-off backfill from the institution's published transaction list, then a weekly feed",
    "stakeholders": "one-off seed from the official directory or register, weekly refresh",
    "media": "a feed (the institution's or region's own channels), read by a tool",
    "other": "live research, cached when fetched",
}

_WORD = re.compile(r"[a-zà-ü0-9]{3,}")
# Words that say a signal is a gap, not WHICH gap: they must never be what joins two signals.
STOP = {"the", "and", "for", "with", "not", "from", "that", "this", "none", "found", "corpus", "unverified", "returned",
        "nothing", "page", "pages", "text", "rule", "rules", "data", "source", "sources", "named", "names", "name", "any", "its",
        "live", "fetched", "fetch", "identified", "labelled", "loaded", "load", "web", "only", "held", "should", "uncited",
        "cited", "served", "missing", "empty", "after", "under", "into", "are", "was", "has", "have", "but", "via", "per",
        "ungrounded", "owner", "note", "record", "records", "version", "current", "may", "one", "two", "three", "four"}


def _stem(w: str) -> str:
    return w[:6] if len(w) > 6 else w


def words(text: str) -> set[str]:
    return {_stem(w) for w in _WORD.findall(text.lower()) if w not in STOP}


def kind_of_host(host: str) -> str:
    if STATUTE_HOSTS.search(host):
        return "statute"
    if SCHEME_HOSTS.search(host):
        return "instrument"
    return "media"


def kind_of_text(text: str) -> str:
    t = text.lower()
    if re.search(r"precedent|signature|transaction list|award|\bsa\.\d", t):
        return "precedents"
    if re.search(r"actor|people|person|official|head of|\bunit\b|whoiswho|organisation chart|contact|rapporteur|stakeholder", t):
        return "stakeholders"
    if re.search(r"\bart\.|article|statute|law|act\b|regulation|directive|decree|bill|reform|code|tub|kwg|cmf|gdpr|omnibus", t):
        return "statute"
    if re.search(r"instrument|product|scheme|programme|call|guarantee|loan|fund\b|conditions", t):
        return "instrument"
    if re.search(r"news|agenda|strategy|press|feed|council|giunta", t):
        return "media"
    return "other"


# ── signal sources ───────────────────────────────────────────────────────────

def _case_of_run(path: Path, text: str) -> str:
    m = re.search(r"mandate/eval/scenarios/([a-z0-9_-]+)\.yaml", text)
    if m:
        return m.group(1)
    m = re.match(r"^\d{4}-\d{2}-\d{2}_(.+?)(?:_round\d+|_italycore|_DRAFT|_\d+)?$", path.stem)
    return m.group(1) if m else path.stem


def from_judgements() -> list[dict]:
    out = []
    for p in sorted(JUDGEMENTS.glob("*.json")):
        rec = json.loads(p.read_text())
        run = rec["label"]
        for g in rec.get("data_gaps", []):
            kind = g.get("kind") if g.get("kind") in KINDS else kind_of_text(f"{g.get('signal', '')} {g.get('source', '')}")
            out.append({"run": run, "case": rec["case"], "kind": kind, "signal": g.get("signal", ""), "source": g.get("source", ""), "via": "judge"})
        for f in rec.get("ungrounded_facts", []):
            out.append({"run": run, "case": rec["case"], "kind": kind_of_text(f), "signal": f"ungrounded: {f}", "source": "", "via": "judge"})
    return out


_W_LINE = re.compile(r"^\s*-?\s*\[w(\d+)\]\s*(?:[^h\n]{0,80})?(https?://\S+)", re.M)
_NONE = re.compile(r"^[^\n]*\b(none found|none in (the )?corpus|no precedent|not in the corpus|returned nothing|returned no|no actors|0 rows|: 0\.?$|: nothing)[^\n]*$", re.M | re.I)
_UNVERIFIED = re.compile(r"([^.\n]{10,160})\(unverified[^)]*\)", re.I)
_GRADE_BLOCK = re.compile(r"^## Grade\b[^\n]*\n+```\n([\s\S]*?)\n```", re.M)


def grade_notes(block: str) -> dict[str, str]:
    """The owner's grade block as key -> text. A key with only `|` or a `# hint` is empty."""
    notes: dict[str, list[str]] = {}
    key = None
    for line in block.splitlines():
        m = re.match(r"^([a-z_/]+):\s*(.*)$", line)
        if m:
            key, rest = m.group(1), m.group(2)
            notes[key] = []
        elif key is None:
            continue
        else:
            rest = line
        rest = re.sub(r"\s+#.*$|^\s*#.*$", "", rest).strip()
        if rest and rest != "|":
            notes[key].append(rest)
    return {k: " ".join(v) for k, v in notes.items()}


def from_runs() -> list[dict]:
    out = []
    for d in RUN_DIRS:
        for p in sorted(d.rglob("*.md")):
            text = p.read_text()
            run = p.stem if d.name == "bench" else f"loop/{p.parent.name}/{p.stem}"
            case = _case_of_run(p, text)
            for _, url in _W_LINE.findall(text):
                host = urlparse(url).hostname or url
                kind = kind_of_host(host)
                if kind in ("statute", "instrument"):
                    out.append({"run": run, "case": case, "kind": kind, "signal": f"fetched live, should be held: {host}", "source": url.rstrip(".,;:)"), "via": "web source"})
            for m in _NONE.finditer(text):
                line = m.group(0).strip()
                if line.startswith("|"):  # a table row (a rubric or a score table), not a finding
                    continue
                line = re.sub(r"^(?:[-*]\s+|\d+\.\s+)", "", line).replace("**", "").replace("`", "")
                if len(line) > 12:
                    out.append({"run": run, "case": case, "kind": kind_of_text(line), "signal": line[:200], "source": "", "via": "transcript"})
            for m in _UNVERIFIED.finditer(text):
                claim = " ".join(m.group(1).split())
                out.append({"run": run, "case": case, "kind": kind_of_text(claim), "signal": f"unverified: {claim[:160]}", "source": "", "via": "transcript"})
            g = _GRADE_BLOCK.search(text)
            if g:
                notes = grade_notes(g.group(1))
                for key in ("whats_off", "must/must_not", "wrong", "missing"):  # what is off, not how to write
                    note = notes.get(key, "")
                    if len(note) > 8:
                        out.append({"run": run, "case": case, "kind": kind_of_text(note), "signal": f"owner note: {note[:240]}", "source": "", "via": "owner"})
    return out


def from_usage() -> list[dict]:
    out = []
    rows: list[dict] = []
    if USAGE_LOCAL.exists():
        for line in USAGE_LOCAL.read_text().splitlines():
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    url = os.environ.get("MANDATE_RO_DATABASE_URL") or os.environ.get("CAPITAL_RO_DATABASE_URL")
    if url:
        try:
            import psycopg  # noqa: PLC0415

            with psycopg.connect(url, connect_timeout=5) as con:
                if con.execute("SELECT to_regclass('mandate.tool_calls')").fetchone()[0]:
                    cur = con.execute("SELECT mission_id, brain, tool, args_summary, result_count FROM mandate.tool_calls "
                                      "WHERE ok AND coalesce(result_count, 0) = 0 ORDER BY at DESC LIMIT 2000")
                    rows += [dict(zip(("mission_id", "brain", "tool", "args_summary", "result_count"), r)) for r in cur]
        except Exception as e:  # noqa: BLE001
            print(f"note: production usage log not read ({str(e)[:80]})", file=sys.stderr)
    for r in rows:
        if r.get("ok") is False or (r.get("result_count") or 0) > 0:
            continue
        tool, args = r.get("tool", ""), r.get("args_summary", "")
        kind = {"find_precedents": "precedents", "actors": "stakeholders", "actors_register_find": "stakeholders",
                "find_instruments": "instrument", "match_status": "statute", "search_law": "statute", "read_agenda": "media",
                "consultations": "statute"}.get(tool, "other")
        out.append({"run": str(r.get("mission_id") or "usage"), "case": "", "kind": kind,
                    "signal": f"{tool} returned nothing: {args[:140]}", "source": "", "via": "usage log"})
    return out


# ── grouping and ranking ─────────────────────────────────────────────────────

def group(signals: list[dict]) -> list[dict]:
    asks: list[dict] = []
    for s in signals:
        key = words(f"{s['signal']} {s['source']}")
        best, best_j = None, 0.0
        for a in asks:
            inter = len(key & a["_words"])
            j = inter / max(1, min(len(key), len(a["_words"])))
            same = a["kind"] == s["kind"]
            if (same and inter >= 2 and j >= 0.4 or inter >= 3 and j >= 0.5) and j > best_j:
                best, best_j = a, j
        if best is None:
            best = {"kind": s["kind"], "_words": set(key), "signals": [], "runs": set(), "cases": set(), "sources": Counter(),
                    "via": Counter(), "kinds": Counter()}
            asks.append(best)
        best["_words"] |= key
        best["kinds"][s["kind"]] += 1
        named = [k for k, _ in best["kinds"].most_common() if k != "other"]
        best["kind"] = named[0] if named else "other"
        best["signals"].append(s["signal"])
        best["runs"].add(s["run"])
        if s["case"]:
            best["cases"].add(s["case"])
        if s["source"]:
            best["sources"][s["source"]] += 1
        best["via"][s["via"]] += 1
    out = []
    for a in asks:
        owner = sorted(c for c in a["cases"] if c in OWNER_CASES)
        src = a["sources"].most_common(1)[0][0] if a["sources"] else ""
        runs, cases = len(a["runs"]), len(a["cases"])
        mode = LOAD_MODE[a["kind"]]
        if runs <= 1 and not owner:
            mode = "live research (seen once); load only if it recurs"
        # The ask is worded by the clearest signal: the judge's (it names the gap), else the shortest.
        label = min(a["signals"], key=lambda t: (t.startswith(("ungrounded:", "unverified:", "owner note:", "- ")), len(t)))
        # A loadable kind with a named source is an ask; "other" is a symptom with no data named yet.
        weight = 0.5 if a["kind"] == "other" else 1.0
        out.append({
            "ask": label[:160], "kind": a["kind"], "kind_label": KIND_LABEL[a["kind"]], "source": src,
            "answers_improved": runs, "owner_cases": owner, "cases": sorted(a["cases"]), "signals": len(a["signals"]),
            "via": dict(a["via"]), "load": mode, "score": weight * runs * (1 + len(owner)) + 0.1 * len(a["signals"]),
            "examples": a["signals"][:4],
        })
    out.sort(key=lambda x: (-x["score"], x["kind"], x["ask"]))
    for i, a in enumerate(out, 1):
        a["rank"] = i
    return out


def mine() -> dict:
    signals = from_judgements() + from_runs() + from_usage()
    asks = group(signals)
    runs = {s["run"] for s in signals}
    return {"signals": len(signals), "runs": len(runs), "asks": asks,
            "by_kind": dict(Counter(a["kind"] for a in asks)), "via": dict(Counter(s["via"] for s in signals))}


def markdown(m: dict, top: int = 25) -> str:
    lines = ["# Data asks: which data would most improve the answers", "",
             f"Mined from {m['signals']} signals across {m['runs']} runs and judgements (judge, transcripts, owner notes, usage log: "
             f"{', '.join(f'{k} {v}' for k, v in sorted(m['via'].items()))}). Re-run: `PYTHONPATH=. python3 -m mandate.eval.data_gaps --write`.",
             "Rank = answers it would have improved x (1 + owner cases it touched). The miner loads nothing.", "",
             "| # | ask | kind | concrete source | answers | owner cases | load |", "|---|---|---|---|---|---|---|"]
    for a in m["asks"][:top]:
        lines.append(f"| {a['rank']} | {a['ask'].replace('|', '/')} | {a['kind_label']} | {a['source'] or '(none named)'} | {a['answers_improved']} | "
                     f"{', '.join(a['owner_cases']) or ''} | {a['load']} |")
    lines += ["", f"{len(m['asks'])} asks in all; by kind: " + ", ".join(f"{KIND_LABEL[k]} {v}" for k, v in sorted(m["by_kind"].items())) + "."]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--write", action="store_true", help="also write mandate/eval/data_gaps.md")
    ap.add_argument("--top", type=int, default=25)
    a = ap.parse_args(argv)
    m = mine()
    if a.json:
        print(json.dumps(m, ensure_ascii=False))
    else:
        print(markdown(m, a.top))
    if a.write:
        OUT_MD.write_text(markdown(m, a.top))
    return 0


if __name__ == "__main__":
    sys.exit(main())
