"""Workstream AY: what does each leaf RESTRICT to, read off its official text?

wsAT's diagnosis says the missing discriminator inside ADEME is `technology`. That
may be true of ADEME and false of the other five large families, and the answer
decides whether a new intake question is worth its place: a question that helps
one regime is worth a fraction of one that helps six.

── Rule Zero ───────────────────────────────────────────────────────────────────
What a fund IS comes from official sources. This reads ONLY columns whose content
is published by the granting body or the transparency register:

    name              the notified scheme title, or the programme/call name
    description       the register's own description
    eligibility_text  fetched from the scheme's own page, with a source URL
    scheme_code       the SA number
    administering_body the granting authority as the register names it

It does NOT read sector_mix, award history, recipient regions, or any other
column the corpus derived from awards. The labels are therefore a statement about
what the fund SAYS it funds, which is the only thing a founder could be asked to
match themselves against.

── What is being labelled ──────────────────────────────────────────────────────
Not "what is this fund about" but "what does it restrict to that its SIBLINGS do
not". Every leaf here shares a regime with at least one other leaf, and the
regime-level restrictions (country, aid framework, broad purpose) are constant
across the group by construction. Only the axis on which a leaf DIFFERS can
separate it, so that is what the model is asked for.

Read-only against the corpus; writes its labels to a JSON cache beside the repo's
other analysis output so a re-run costs nothing.
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict

import anthropic
import psycopg2
import psycopg2.extras

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib"))
from etl_env import ROOT  # noqa: E402

CACHE = ROOT / "data" / "wsay_leaf_axes.json"
MODEL = "claude-opus-5"
BATCH = 12

# ── The axes ────────────────────────────────────────────────────────────────
# Each is a candidate for an intake question, and each is phrased as something a
# founder could state about THEMSELVES or their project. `applicant_type` and
# `spend_stage` map onto fields the intake already has or nearly has;
# `technology_or_measure` and `sector` are the two wsAT pointed at; `region` is
# the one the corpus already collects and barely uses.
SCHEMA = {
    "type": "object",
    "properties": {
        "leaves": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "primary_axis": {
                        "type": "string",
                        "enum": [
                            "technology_or_measure",
                            "spend_stage",
                            "applicant_type",
                            "region",
                            "sector",
                            "award_size",
                            "none_apparent",
                        ],
                        "description":
                            "The ONE thing this call restricts to that a sibling under the same "
                            "regime plausibly would not. none_apparent if the official text names "
                            "no restriction beyond what the whole regime already implies.",
                    },
                    "spend_stage": {
                        "type": "string",
                        "enum": [
                            "study_or_audit", "research", "development_or_prototype",
                            "capex_or_equipment", "commercialisation", "advice_or_skills",
                            "mixed_or_unstated",
                        ],
                        "description": "What the money is stated to pay for.",
                    },
                    "applicant_type": {
                        "type": "string",
                        "enum": [
                            "company_any", "sme_only", "large_only", "research_org",
                            "public_body", "association_or_nonprofit", "consortium_required",
                            "unstated",
                        ],
                    },
                    "technology_label": {
                        "type": "string",
                        "description":
                            "If the call names a specific technology, scientific field or physical "
                            "measure (e.g. 'geothermal heat', 'heavy electric vehicles', 'plastics "
                            "recycling', '6G'), name it in 1-4 English words. Empty string if the "
                            "call is technology-neutral.",
                    },
                    "sector_label": {
                        "type": "string",
                        "description":
                            "If the call restricts WHICH INDUSTRY THE APPLICANT OPERATES IN (not "
                            "what the project does), name it in 1-4 English words. Empty string "
                            "otherwise. A call for 'solar feasibility studies' open to any company "
                            "has a technology_label and NO sector_label.",
                    },
                    "region_label": {
                        "type": "string",
                        "description":
                            "The sub-national territory the call is restricted to, if any, as the "
                            "text names it. Empty string if national or unstated.",
                    },
                },
                "required": [
                    "id", "primary_axis", "spend_stage", "applicant_type",
                    "technology_label", "sector_label", "region_label",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": ["leaves"],
    "additionalProperties": False,
}

SYSTEM = """\
You are reading official funding-scheme records to establish what each call
restricts itself to.

Every record you are given is a LEAF of a larger regime, and you are told which
regime. The regime's own restrictions — the country, the aid framework, the broad
purpose — are shared by every sibling and are therefore NOT the answer. Label
only what would distinguish this leaf from another leaf of the same regime.

Read only the text supplied. Do not infer a restriction the text does not state:
`none_apparent`, `unstated` and empty strings are correct answers and are more
useful than a guess. Titles are in the scheme's own language; translate labels
into English.

Two distinctions matter and are easy to blur:

  * A TECHNOLOGY OR MEASURE is what the project does — installing a heat pump,
    recycling plastics, developing a 6G radio. A SECTOR is what the applicant
    company is — a hotel, a foundry, a bank. A call funding solar feasibility
    studies is a technology restriction, and any company with a roof can apply;
    it is NOT a sector restriction.

  * SPEND STAGE is what the money buys — a study, a prototype, a machine, a
    market launch. Two calls can name the same technology and differ only here,
    and in some regimes that is the whole difference between them."""


def brief(r: dict) -> str:
    parts = [f"id: {r['id']}", f"regime: {r['parent_id']}", f"country: {r['country']}"]
    if r.get("name"):
        parts.append(f"title: {r['name']}")
    if r.get("administering_body"):
        parts.append(f"granting body: {r['administering_body']}")
    if r.get("scheme_code"):
        parts.append(f"notified scheme: {r['scheme_code']}")
    if r.get("award_p50"):
        parts.append(f"median award: EUR {int(float(r['award_p50'])):,}")
    if r.get("description"):
        parts.append(f"description: {str(r['description'])[:700]}")
    if r.get("eligibility_text"):
        parts.append(f"published eligibility: {str(r['eligibility_text'])[:1200]}")
    return "\n".join(parts)


def main():
    db = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = db.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT id, parent_id, name, country, description, eligibility_text,
               scheme_code, administering_body, award_p50
          FROM funding_instruments
    """)
    rows = [dict(r) for r in cur.fetchall()]
    db.close()

    by_regime = defaultdict(list)
    for r in rows:
        by_regime[r["parent_id"] or r["id"]].append(r)
    targets = [r for g in by_regime.values() if len(g) > 1 for r in g]
    print(f"multi-leaf leaves to label: {len(targets)}")

    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    todo = [r for r in targets if r["id"] not in cache]
    print(f"already cached: {len(targets) - len(todo)}   uncached: {len(todo)}")
    # LIMIT= exists so the first run of a change can be priced on two batches
    # before it is paid for on 780 leaves.
    if os.environ.get("LIMIT"):
        todo = todo[:int(os.environ["LIMIT"])]
        print(f"LIMIT set: fetching {len(todo)}")
    if not todo:
        print("nothing to do")
        return

    client = anthropic.Anthropic()
    for i in range(0, len(todo), BATCH):
        chunk = todo[i:i + BATCH]
        body = "\n\n---\n\n".join(brief(r) for r in chunk)
        resp = client.messages.create(
            model=MODEL,
            max_tokens=8000,
            system=SYSTEM,
            thinking={"type": "adaptive"},
            output_config={
                "effort": "medium",
                "format": {"type": "json_schema", "schema": SCHEMA},
            },
            messages=[{"role": "user", "content":
                       f"Label each of these {len(chunk)} leaves.\n\n{body}"}],
        )
        if resp.stop_reason == "refusal":
            print(f"  batch {i // BATCH}: refused, skipping")
            continue
        text = next(b.text for b in resp.content if b.type == "text")
        for leaf in json.loads(text)["leaves"]:
            cache[leaf["id"]] = leaf
        CACHE.write_text(json.dumps(cache, indent=1, ensure_ascii=False))
        print(f"  {min(i + BATCH, len(todo))}/{len(todo)}  "
              f"(in {resp.usage.input_tokens} out {resp.usage.output_tokens})")

    print(f"labelled {len(cache)} leaves -> {CACHE}")


if __name__ == "__main__":
    main()
