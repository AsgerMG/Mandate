"""The citation validator: every citation a mission stored must resolve in
grounding, and its quote must be exactly what the cited span holds.

It reads the mission AS STORED (mandate-api GET /missions/{id}: decisions,
flags, the deliverable message, the watchlist) rather than the events the UI
saw, because the store is what a founder or an auditor will check later. Each
citation goes back through mandate-api /grounding/verify, which re-reads the
version by sha256 and compares the quote to the span.

It also counts claims by label. An unlabelled claim cannot be stored (the
schema refuses it), so `unlabelled` should always be 0; it is counted anyway,
because a validator that assumes the writer's invariant checks nothing.
"""
from __future__ import annotations

from collections.abc import Callable

BASES = ("cited", "judgement", "unverified")


def _claim_lists(mission: dict) -> list[tuple[str, list, dict]]:
    out = []
    for d in mission.get("decisions", []):
        out.append((f"decision:{d.get('title')}", d.get("claims") or [], d.get("citations") or {}))
    for f in mission.get("flags", []):
        out.append((f"flag:{f.get('title')}", f.get("claims") or [], f.get("citations") or {}))
    for m in mission.get("messages", []):
        d = (m.get("payload") or {}).get("deliverable")
        if d:
            cits = (m.get("payload") or {}).get("citations") or {}
            for s in d.get("sections", []):
                out.append((f"deliverable:{s.get('heading')}", s.get("claims") or [], cits))
    for w in mission.get("watchlist", []):
        if w.get("citations"):
            out.append((f"watch:{w.get('subject')}", [], w["citations"]))
    return out


def validate(mission: dict, verify: Callable[[list[dict]], list[dict]]) -> dict:
    claims = {b: 0 for b in BASES} | {"unlabelled": 0, "cited_to_missing_id": 0}
    citations: list[tuple[str, str, dict]] = []
    for where, cl, cits in _claim_lists(mission):
        for c in cl:
            basis = c.get("basis")
            if basis not in BASES:
                claims["unlabelled"] += 1
                continue
            claims[basis] += 1
            if basis == "cited":
                claims["cited_to_missing_id"] += sum(1 for i in c.get("citation_ids") or [] if i not in cits)
        for cid, c in cits.items():
            citations.append((where, cid, c))
    results = verify([c for _, _, c in citations]) if citations else []
    failures = [
        {"where": where, "id": cid, "url": c.get("canonical_url"), "reason": r.get("reason")}
        for (where, cid, c), r in zip(citations, results)
        if not (r.get("resolved") and r.get("quote_matched"))
    ]
    total = len(citations)
    ok = total - len(failures)
    labelled = sum(claims[b] for b in BASES)
    return {
        "total": total, "resolved": sum(1 for r in results if r.get("resolved")),
        "quote_matched": sum(1 for r in results if r.get("quote_matched")), "failures": failures,
        "score": (ok / total) if total else None,
        "claims": claims,
        "cited_share": (claims["cited"] / labelled) if labelled else None,
    }
