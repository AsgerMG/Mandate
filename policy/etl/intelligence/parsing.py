"""Reading the model's output back: citations, tables, hinges, consistency checks.

Split out of ``briefing.py`` on 2026-07-28. Everything here takes generated text
(or SDK content blocks) and returns structured facts — the opposite direction from
the rest of the briefing pipeline, which assembles input. Keeping the two apart
makes it obvious which functions are allowed to know about the Anthropic SDK's
shapes and which are pure string work.

Three groups:

* **Citation resolution** — ``parse_response`` maps the native Citations API's
  ``document_index`` back to a passage's real provenance, which is what makes
  "every claim traces to a source" true by construction rather than by asking.
* **Deterministic checks** — ``_canon_issues`` and ``prio_verdict_issues`` find
  defects the model then fixes. The check finds, the model fixes; neither
  silently rewrites the other's work.
* **Structured extraction** — ``extract_hinges`` reads the unresolved scoping
  hinges a brief named, by parsing the phrasing the prompt already mandates
  rather than paying for a second model call.
"""

from __future__ import annotations

import re
from typing import Any

from etl.adapters.eurlex_key_acts import KEY_ACTS

_MARKER_RE = re.compile(r"\[\d+(?:,\s*\d+)*\]")
_NUMREF_RE = re.compile(r"(\d{4})\s*/\s*(\d{1,4})")
# Words too generic to identify an instrument on their own.
_NAME_STOPWORDS = {"the", "of", "and", "for", "on", "in", "a", "an", "eu", "european"}


def _sort_compliance_table(briefing: str) -> str:
    """Enforce the Compliance table's row order deterministically: Prio
    ascending, In Scope before Monitor within the same Prio. The prompt
    states this rule but the model doesn't reliably follow it (observed
    live: a Prio-2 row rendered after a Prio-3 one). Ordering is pure
    presentation with a fully specified rule, so unlike names/verdicts —
    which stay the model's call, corrected only via a model round-trip —
    this is safe to just fix in code. Only tables whose header carries a
    Prio column are touched (the Out-of-Scope appendix has none); rows
    whose Prio cell doesn't parse keep their relative position at the end.
    The sort is stable, so the model's own ordering survives within each
    (Prio, Verdict) group. Citation markers travel with their row."""

    def row_key(line: str) -> tuple[int, int]:
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        prio_m = re.search(r"\d", cells[1]) if len(cells) > 1 else None
        prio = int(prio_m.group()) if prio_m else 99
        verdict_rank = 0 if len(cells) > 2 and "in scope" in cells[2].lower() else 1
        return (prio, verdict_rank)

    lines = briefing.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        is_prio_header = (
            stripped.startswith("|")
            and any(c.strip().lower() == "prio" for c in stripped.strip("|").split("|"))
        )
        if not is_prio_header:
            out.append(lines[i])
            i += 1
            continue
        out.append(lines[i])  # header
        i += 1
        if i < len(lines) and set(lines[i].strip()) <= {"|", "-", ":", " "}:
            out.append(lines[i])  # separator
            i += 1
        body: list[str] = []
        while i < len(lines) and lines[i].strip().startswith("|"):
            body.append(lines[i])
            i += 1
        out.extend(sorted(body, key=row_key))
    result = "\n".join(out)
    if briefing.endswith("\n") and not result.endswith("\n"):
        result += "\n"
    return result


def _celex_ref(celex: str) -> tuple[str, int] | None:
    """'32024R0900' -> ('2024', 900); works for sector-5 proposals too."""
    m = re.match(r"^\d(\d{4})[A-Z]{1,2}(\d+)$", celex)
    if not m:
        return None
    return m.group(1), int(m.group(2))


def _instrument_cells(briefing: str) -> list[str]:
    """First cell of every table body row, both tables."""
    cells = []
    for line in briefing.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        first = stripped.strip("|").split("|")[0].strip()
        if first and first != "Instrument" and set(first) - {"-", ":", " "}:
            cells.append(first)
    return cells


def _name_matches(cell: str, short: str) -> bool:
    """Does this instrument cell plausibly name the canon act ``short``?

    Deliberately lenient — a false match occasionally hides an omission, but
    a false MISmatch would trigger a spurious correction call, which is the
    costlier error. Matches on: an acronym-grade token (parenthetical,
    all-caps, or digit-bearing, e.g. DMA/TTPA/NIS2/eIDAS), any two-word
    phrase from the name, or — for short names — a distinctive single word."""
    cell_l = cell.lower()
    grade: list[str] = []
    for par in re.findall(r"\(([^)]+)\)", short):
        grade += re.split(r"[/\s]+", par)
    base = re.sub(r"\([^)]*\)", " ", short)
    for tok in re.findall(r"[A-Za-z0-9]+", base):
        if any(ch.isdigit() for ch in tok) or (tok.isupper() and len(tok) >= 3):
            grade.append(tok)
    for tok in grade:
        if len(tok) >= 3 and tok.lower() in cell_l:
            return True
    words = [w.lower() for w in re.findall(r"[A-Za-z0-9]+", base)]
    words = [w for w in words if w not in _NAME_STOPWORDS]
    if not words:
        return False
    if len(words) == 1:
        return re.search(rf"\b{re.escape(words[0])}\b", cell_l) is not None
    if any(f"{a} {b}" in cell_l for a, b in zip(words, words[1:], strict=False)):
        return True
    # Distinctive leading word ("ePrivacy ..." cells often drop "Directive").
    return len(words[0]) >= 6 and re.search(rf"\b{re.escape(words[0])}", cell_l) is not None


def _canon_issues(briefing: str, passages: list[dict]) -> list[str]:
    """Judgment-free cross-check of the report's tables against the canon acts
    actually in context. Returns human-readable problems for the model to fix:
    mislabeled instrument rows (number and name disagree) and canon acts with
    a row in neither table. Empty list = consistent. Reports without any table
    (dry runs, degenerate outputs) are skipped rather than flagged."""
    canon_in_context: dict[str, str] = {}
    for p in passages:
        short = KEY_ACTS.get(p.get("celex") or "")
        if short:
            canon_in_context[p["celex"]] = short
    cells = _instrument_cells(briefing)
    if not canon_in_context or not cells:
        return []

    ref_to_celex = {}
    for celex in canon_in_context:
        ref = _celex_ref(celex)
        if ref:
            ref_to_celex[ref] = celex

    issues: list[str] = []
    for cell in cells:
        for year, num in _NUMREF_RE.findall(cell):
            celex = ref_to_celex.get((year, int(num)))
            if celex and not _name_matches(cell, canon_in_context[celex]):
                issues.append(
                    f"A table row names its instrument '{cell}', but {year}/{int(num)} "
                    f"in the retrieved documents is '{canon_in_context[celex]}'. Correct "
                    "the row: fix the name if the row's substance is genuinely about "
                    "this instrument; otherwise replace the row with an accurate one "
                    "for it."
                )

    for celex, short in canon_in_context.items():
        ref = _celex_ref(celex)
        present = any(
            _name_matches(cell, short)
            or (ref is not None and any((y, int(n)) == ref for y, n in _NUMREF_RE.findall(cell)))
            for cell in cells
        )
        if not present:
            ref_str = f"{ref[0]}/{ref[1]}" if ref else celex
            issues.append(
                f"'{short}' ({ref_str}) is among the retrieved documents but has a row "
                "in neither the Compliance exposure table nor the Out of Scope "
                "appendix — add it to whichever table its verdict warrants."
            )
    return issues


# Compliance-table rows are "| Instrument | Prio | Verdict | Why / Trigger |".
_TABLE_ROW = re.compile(r"^\s*\|(?P<cells>.+)\|\s*$")
# The prompt mandates this phrasing for an unresolved hinge ("hinges on whether
# turnover exceeds €450M — confirm"), which is what makes hinges machine-readable
# without asking the model for a second structured output.
_HINGE = re.compile(
    r"hinges?\s+on\s+(?:whether\s+)?(?P<hinge>[^|]{4,200}?)(?:\s*—\s*confirm|$)",
    re.IGNORECASE,
)


def _table_rows(briefing: str) -> list[list[str]]:
    """Compliance-table rows as cell lists, skipping the header and separator."""
    rows: list[list[str]] = []
    for line in (briefing or "").splitlines():
        match = _TABLE_ROW.match(line)
        if not match:
            continue
        cells = [c.strip() for c in match.group("cells").split("|")]
        if len(cells) < 4:
            continue
        joined = " ".join(cells).lower()
        if set(joined) <= set("-: ") or joined.startswith("instrument"):
            continue
        rows.append(cells)
    return rows


def extract_hinges(briefing: str) -> list[dict[str, str]]:
    """Unresolved scoping hinges the brief itself named, as structured records.

    Why this exists: the judge's critiques identified unresolved hinges as what
    caps `prioritization` and `scope_matching` — every hinge is a verdict that
    cannot be decisive. But the leverage is not "add more questions", it is
    knowing which hinges *recur*, and that was unknowable because the hinge
    existed only in prose. Emitting them structurally makes the follow-up
    question set (questions.py) targetable at the hinges that actually show up
    rather than at hinges we imagine.

    Parses the phrasing the prompt already mandates rather than asking the model
    for a second structured output — no extra call, and it degrades to an empty
    list if a brief phrases things differently.
    """
    found: list[dict[str, str]] = []
    for cells in _table_rows(briefing):
        instrument, verdict, why = cells[0], cells[2], " ".join(cells[3:])
        match = _HINGE.search(why)
        if not match:
            continue
        found.append(
            {
                "instrument": instrument,
                "verdict": re.sub(r"\*+", "", verdict).strip(),
                "prio": cells[1],
                "hinge": " ".join(match.group("hinge").split()).rstrip(" .,"),
            }
        )
    return found


def prio_verdict_issues(briefing: str) -> list[str]:
    """Rows that violate the PRIO/VERDICT CONSISTENCY rule.

    A deterministic check on the rule added 2026-07-28 after the judge flagged
    "Prio 1 given to a 'Monitor' verdict with no confirmed high-risk trigger".
    Prio and Verdict stay independent — a Monitor row CAN be Prio 1 on a
    confirmed external trigger — so this only fires on the one combination that
    cannot be right: Prio 1 + Monitor + a hinge the brief itself says is
    unresolved.

    Returned rather than fixed, in the same spirit as _canon_issues: the check
    finds, the model fixes.
    """
    issues: list[str] = []
    for cells in _table_rows(briefing):
        instrument, prio, verdict, why = cells[0], cells[1], cells[2], " ".join(cells[3:])
        if "1" not in prio:
            continue
        if "monitor" not in verdict.lower():
            continue
        if not _HINGE.search(why):
            continue
        issues.append(
            f"'{instrument}' is Prio 1 with verdict Monitor while its own Why/Trigger "
            "still names an unresolved hinge. Prio 1 tells the reader to resource it "
            "now, which cannot rest on applicability you have just called unknown. "
            "Demote it to Prio 2 naming the unresolved fact as what would promote it, "
            "and if an ACTION bullet exists for this row, rewrite it as establishing "
            "that fact rather than doing the compliance work."
        )
    return issues





def _raw_text(content_blocks: list[Any]) -> str:
    """Concatenate text blocks without citation markers — the plain draft to
    feed back into the revise pass."""
    return "".join(
        _attr(b, "text", "") for b in content_blocks if _attr(b, "type") == "text"
    )



def _attr(obj: Any, key: str, default=None):
    """Read a field whether obj is an SDK model or a plain dict (for tests)."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def parse_response(content_blocks: list[Any], passages: list[dict]) -> dict[str, Any]:
    """Flatten Claude's text blocks and resolve citations back to passage sources.

    Each distinct source gets a stable footnote number, and a ``[n]`` marker is
    appended after every cited span — so the report reads like a firm memo with
    numbered references, and the sources list can be rendered as footnotes."""
    text_parts: list[str] = []
    citations: list[dict] = []
    source_numbers: dict[str, int] = {}
    for block in content_blocks:
        if _attr(block, "type") != "text":
            continue
        block_refs: list[int] = []
        for cite in _attr(block, "citations") or []:
            idx = _attr(cite, "document_index")
            src = passages[idx] if isinstance(idx, int) and 0 <= idx < len(passages) else {}
            key = str(src.get("celex") or src.get("url") or src.get("title") or f"doc-{idx}")
            n = source_numbers.setdefault(key, len(source_numbers) + 1)
            if n not in block_refs:
                block_refs.append(n)
            citations.append(
                {
                    "n": n,
                    "cited_text": _attr(cite, "cited_text"),
                    "title": src.get("title"),
                    "celex": src.get("celex"),
                    "url": src.get("url"),
                    "char_start": src.get("char_start"),
                    "char_end": src.get("char_end"),
                    # Carries "verbatim_debate" through to the human-facing
                    # source list (CLI, PDF, website) — Claude already sees
                    # the "[Jurisdiction · Verbatim debate]" document label
                    # via build_documents(); a reader skimming citations
                    # afterward should be able to tell a floor speech from
                    # any other source too.
                    "kind": src.get("kind"),
                }
            )
        marker = "".join(f"[{n}]" for n in block_refs)
        text_parts.append(_attr(block, "text", "") + marker)
    return {"briefing": "".join(text_parts), "citations": citations}

