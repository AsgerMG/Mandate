"""Merge a coverage audit's paste-ready block into the knowledge map. No network, no model.

    python3 capital/ETL/terms/merge_audit_block.py --market UK            # show what would be added
    python3 capital/ETL/terms/merge_audit_block.py --market UK --apply    # write the map
    python3 capital/ETL/terms/merge_audit_block.py --market DE --repair   # re-write entries already in the map
                                                                          # from the audit block (names that were cut)

The agents write each entry as a one-line YAML flow mapping with UNQUOTED values, e.g.
`- {key: uk.bist, name: Department for Business, Innovation, Science and Trade, kind: ministry}`.
`yaml.safe_load` splits that name at every comma (19 Nov: six German names were cut and four
reached production). This parser splits only before a KNOWN field name, so a comma inside a
value stays in the value. Each section of the market's block in the map gets the new entries
appended (keys already present are skipped, never overwritten unless --repair), values written
as JSON strings (valid YAML), the agent's trailing comment kept.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MAP = ROOT / "mandate/brains/wincent/knowledge_map.yaml"
SECTIONS = ("institutions", "products", "processes", "org_charts")
FIELDS = ("key", "name", "name_local", "kind", "parent", "level", "region", "role", "offered_by",
          "type", "title", "for", "url", "cadence", "note")
_SPLIT = re.compile(r",\s*(?=(?:" + "|".join(FIELDS) + r"):\s)")


def parse_entry(line: str) -> tuple[dict, str] | None:
    """`- {k: v, ...}  # comment` -> ({k: v}, comment). None if the line is not an entry."""
    s = line.strip()
    if not s.startswith("- {"):
        return None
    close = s.rfind("}")
    body, rest = s[3:close], s[close + 1:].strip()
    out: dict = {}
    for part in _SPLIT.split(body):
        k, sep, v = part.partition(":")
        k = k.strip()
        if not sep or k not in FIELDS:
            raise ValueError(f"unknown field {k!r} in: {line.strip()[:120]}")
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
            v = v[1:-1]
        out[k] = v
    if "key" not in out:
        raise ValueError(f"no key in: {line.strip()[:120]}")
    return out, rest if rest.startswith("#") else ""


def parse_block(md: str) -> dict[str, list[tuple[dict, str]]]:
    """The LAST ```yaml block of an audit.md, by section."""
    blocks = re.findall(r"```yaml\n(.*?)```", md, flags=re.S)
    if not blocks:
        raise ValueError("no ```yaml block in the audit")
    out: dict[str, list] = {s: [] for s in SECTIONS}
    sec = None
    for line in blocks[-1].splitlines():
        head = line.strip().rstrip(":")
        if not line.startswith(" ") and head in SECTIONS:
            sec = head
            continue
        e = parse_entry(line)
        if e and sec:
            out[sec].append(e)
    return out


def render(entry: dict, comment: str, indent: str) -> str:
    vals = ", ".join(f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in entry.items() if v != "" or k == "url")
    return f"{indent}- {{{vals}}}" + (f"  {comment}" if comment else "")


def merge(text: str, market: str, block: dict, *, repair: bool) -> tuple[str, list[str]]:
    lines = text.splitlines()
    report: list[str] = []
    m_at = next((i for i, l in enumerate(lines) if re.match(rf"^  {market}:\s*$", l)), None)
    if m_at is None:
        raise ValueError(f"market {market} not in the map")
    m_end = next((i for i in range(m_at + 1, len(lines)) if re.match(r"^  \S", lines[i])), len(lines))
    for sec in SECTIONS:
        s_at = next((i for i in range(m_at, m_end) if lines[i] == f"    {sec}:"), None)
        if s_at is None:
            report.append(f"  {sec}: no such section in the {market} block; {len(block[sec])} entries not merged")
            continue
        s_end = next((i for i in range(s_at + 1, m_end) if re.match(r"^    \S", lines[i])), m_end)
        have = {}
        for i in range(s_at + 1, s_end):
            mk = re.search(r"\{key: ['\"]?([a-z0-9_.]+)", lines[i])
            if mk:
                have[mk.group(1)] = i
        add = []
        for e, c in block[sec]:
            if e["key"] in have:
                if repair and sec != "org_charts" and have[e["key"]] >= 0:
                    import yaml  # noqa: PLC0415
                    cur = (yaml.safe_load(lines[have[e["key"]]].split("  #")[0].strip()[2:]) or {})
                    new = render(e, c, "      ")
                    if set(cur) - set(FIELDS):  # only an entry yaml cut apart is re-written
                        lines[have[e["key"]]] = new
                        report.append(f"  {sec}: repaired {e['key']} -> {e.get('name') or e.get('title')}")
                continue
            if sec == "org_charts" and not e.get("url"):
                report.append(f"  org_charts: {e['key']} has no url yet; not added")
                continue
            add.append(render(e, c, "      "))
            have[e["key"]] = -1
        if add and not repair:
            lines[s_end:s_end] = add
            m_end += len(add)
            report.append(f"  {sec}: {len(add)} added")
    return "\n".join(lines) + "\n", report


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", required=True)
    ap.add_argument("--audit", help="default capital/reference/graph_<m>/audit.md")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--repair", action="store_true")
    a = ap.parse_args()
    mk = a.market.upper()
    audit = Path(a.audit) if a.audit else ROOT / f"capital/reference/graph_{mk.lower()}/audit.md"
    text = MAP.read_text()
    out, report = merge(text, mk, parse_block(audit.read_text()), repair=a.repair)
    import yaml  # noqa: PLC0415  (the merged map must still load, and every name must be whole)
    m = yaml.safe_load(out)["markets"][mk]
    bad = [n["key"] for s in SECTIONS for n in m.get(s) or [] if set(n) - set(FIELDS)]
    if bad:
        print(f"REFUSED: entries with stray fields (a cut value?): {bad}", file=sys.stderr)
        return 1
    print("\n".join(report) or "  nothing to merge")
    if a.apply or a.repair:
        MAP.write_text(out)
        print(f"wrote {MAP.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
