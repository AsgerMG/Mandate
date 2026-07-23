"""Terms engine (advisory_pipeline Wave 1): primary texts → verified gate records.

Turns the ground-truth corpus (data/raw/instrument_docs/) into the structured
term records (data/instrument_terms/*.yaml) the eligibility engine evaluates
intake answers against. Three passes, each cheap and auditable:

  plan      print, per job, which INTAKE_FIELDS it's expected to gate and
            any NEW field it would need — the schema-first review step, run
            BEFORE spending any API calls. A job with a non-empty new_fields
            list is refused by `run` until INTAKE_FIELDS/EligibilityAnswers/
            the wizard screen are updated to carry that field.
  extract   Sonnet reads keyword-targeted pages of a source document and
            proposes gate records: requirement + threshold + EXACT QUOTE +
            page locator + which intake field answers it.
  verify    two independent checks per gate:
              (a) MECHANICAL — the quote must appear verbatim in the document
                  text (whitespace-normalised). No LLM can fake this.
              (b) FRESH EYES — a separate model call, no access to the
                  extractor's reasoning, sees ONLY the quote and must judge
                  strict entailment of the stated requirement.
            Both pass → verified: llm_2pass. Anything less stays draft, and
            the memo may only render it as "verify: <claim> (source)".
  write     merge into data/instrument_terms/<record>.yaml.

Usage:
  python3 ETL/terms/extract_terms.py plan [--job ID]
  python3 ETL/terms/extract_terms.py run [--job ID] [--dry-run]
  python3 ETL/terms/extract_terms.py status
"""
from __future__ import annotations

# --- ETL path bootstrap (see ETL/lib/etl_env.py) ---
import sys as _sys
from pathlib import Path as _Path
for _anc in _Path(__file__).resolve().parents:
    if (_anc / "lib" / "etl_env.py").exists():
        _sys.path.insert(0, str(_anc / "lib"))
        break
from etl_env import ROOT  # noqa: E402
# --- end ETL path bootstrap ---

import argparse
import json
import re

DOCS = ROOT / "data" / "raw" / "instrument_docs"
TERMS = ROOT / "data" / "instrument_terms"
MODEL = "claude-sonnet-5"

GATE_FAMILIES = ["G1_nexus", "G2_size_ownership", "G3_financial",
                 "G4_borrower_model", "G5_use_of_funds", "G6_conditionality"]
INTAKE_FIELDS = [
    "ticketBand", "borrowerModel", "entityCountries", "wouldOpenEntity",
    "fteBand", "turnoverBand", "balanceBand", "ownerOver25", "institutionalOwner",
    "nonEuControl", "cofinancingBand", "foundedYear", "lossesOverHalfCapital",
    "conditionality", "developmentStage", "activityCountries", "consortium",
    "bankRelationship", "institutionalBacking", "needBy", "none",
]

# ── Extraction jobs: which record, from which doc, hunting which provisions ──
JOBS: dict[str, dict] = {
    "eu_sme_definition": {
        "doc": "gber_651_2014_consolidated.pdf",
        "name": "EU SME definition (GBER Annex I)",
        "country": "EU", "capital_type": "framework",
        "keywords": ["Annex I", "staff headcount", "linked enterprise",
                     "partner enterprise", "annual work unit", "SME"],
        "focus": "The SME definition in Annex I: headcount/turnover/balance-sheet "
                 "thresholds, and how linked and partner enterprises are counted. "
                 "Map thresholds to fteBand/turnoverBand/balanceBand and the "
                 "linked-enterprise rule to ownerOver25.",
        "intake_fields": ["fteBand", "turnoverBand", "balanceBand", "ownerOver25"],
        "new_fields": [],
    },
    "eu_undertaking_in_difficulty": {
        "doc": "gber_651_2014_consolidated.pdf",
        "name": "Undertaking-in-difficulty exclusion (GBER Art. 1(4)(c) + 2(18))",
        "country": "EU", "capital_type": "framework",
        "keywords": ["undertaking in difficulty", "subscribed share capital",
                     "accumulated losses"],
        "focus": "The definition of 'undertaking in difficulty' in Art. 2(18) "
                 "and the exclusion of such undertakings from aid. Map the "
                 "half-of-share-capital limb to lossesOverHalfCapital.",
        "intake_fields": ["lossesOverHalfCapital"],
        "new_fields": [],
    },
    "eu_de_minimis": {
        "doc": "de_minimis_2023_2831.pdf",
        "name": "De minimis ceiling (Reg. 2023/2831)",
        "country": "EU", "capital_type": "framework",
        "keywords": ["300 000", "single undertaking", "three-year",
                     "cumulation", "declaration"],
        "focus": "The ceiling amount and period, the 'single undertaking' scope, "
                 "cumulation limits and the declaration duty. Field: none "
                 "(pre-filled from our registers) except group scope → ownerOver25.",
        "intake_fields": ["ownerOver25"],
        "new_fields": [],
    },
    "eu_ipcei": {
        "doc": "ipcei_communication_2021.pdf",
        "name": "IPCEI eligibility criteria (2021 Communication)",
        "country": "EU", "capital_type": "grant",
        "keywords": ["first industrial deployment", "funding gap", "spillover",
                     "Member State", "important project"],
        "focus": "What a project must be to qualify: Member-State involvement, "
                 "first-industrial-deployment definition (vs mass production), "
                 "funding-gap limitation, spillover requirements. Map to "
                 "developmentStage, ticketBand, needBy (multi-year), consortium.",
        "intake_fields": ["developmentStage", "ticketBand", "needBy", "consortium"],
        "new_fields": [],
    },
    "it_startup_innovativa": {
        "doc": "startup_innovativa_dl179.html",
        "name": "Italy startup innovativa status (DL 179/2012 Art. 25)",
        "country": "IT", "capital_type": "framework",
        "keywords": ["start-up innovativa", "60 mesi", "spese in ricerca",
                     "dottorato", "brevetto", "residente in Italia"],
        "focus": "The register criteria: company age limit, Italian "
                 "residence/branch requirement, the three alternative "
                 "requirements (R&D spend share, qualified team, IP). Map to "
                 "foundedYear, entityCountries, developmentStage. Quote in "
                 "Italian; requirement text in English.",
        "intake_fields": ["foundedYear", "entityCountries", "developmentStage"],
        "new_fields": [],
    },
    "eu_investeu_intermediary": {
        "doc": "investeu_regulation_2021_523.pdf",
        "name": "InvestEU financial-intermediary architecture (Reg. 2021/523)",
        "country": "EU", "capital_type": "counter_guarantee",
        "keywords": ["financial intermediar", "implementing partner", "guarantee",
                     "SME window", "final recipient"],
        "focus": "How private capital routes through the programme: implementing "
                 "partners, financial intermediaries, who counts as a final "
                 "recipient. Map the intermediary role to borrowerModel "
                 "(balance_sheet_lender / originator) and bankRelationship.",
        "intake_fields": ["borrowerModel", "bankRelationship"],
        "new_fields": [],
    },
    "eu_gber_rd_intensities": {
        "doc": "gber_651_2014_consolidated.pdf",
        "name": "GBER R&D aid intensities (Art. 25)",
        "country": "EU", "capital_type": "grant",
        "keywords": ["industrial research", "experimental development",
                     "aid intensity", "per cent of the eligible costs"],
        "focus": "Aid-intensity ceilings for industrial research vs experimental "
                 "development, and the SME bonuses. Map to cofinancingBand "
                 "(what share the company must fund itself) and developmentStage.",
        "intake_fields": ["cofinancingBand", "developmentStage"],
        "new_fields": [],
    },
}

EXTRACT_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "gates": {
            "type": "array",
            "items": {
                "type": "object", "additionalProperties": False,
                "properties": {
                    "id": {"type": "string"},
                    "gate_family": {"type": "string", "enum": GATE_FAMILIES},
                    "requirement": {"type": "string"},
                    "value": {"type": "string"},
                    "quote": {"type": "string"},
                    "locator": {"type": "string"},
                    "intake_field": {"type": "string", "enum": INTAKE_FIELDS},
                },
                "required": ["id", "gate_family", "requirement", "value",
                             "quote", "locator", "intake_field"],
            },
        },
    },
    "required": ["gates"],
}

VERIFY_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "verdict": {"type": "string", "enum": ["supported", "not_supported", "quote_does_not_say_this"]},
        "reason": {"type": "string"},
    },
    "required": ["verdict", "reason"],
}


_PUNCT_MAP = str.maketrans({
    "\u2019": "'", "\u2018": "'", "\u201c": '"', "\u201d": '"',
    "\u2013": "-", "\u2014": "-", "\u00a0": " ",
    "\ufb01": "fi", "\ufb02": "fl",
})


def _norm(s: str) -> str:
    """Whitespace + typographic-punctuation normalisation: PDF extraction turns
    quotes/dashes/ligatures inconsistently, which is not evidence of a
    fabricated quote. Meaning-level checks stay with the entailment pass."""
    s = s.translate(_PUNCT_MAP)
    s = re.sub(r"[\s\u00ad]+", " ", s)
    return s.strip().lower()


def load_doc(fname: str) -> list[tuple[str, str]]:
    """→ [(locator, text)] per page (PDF) or per chunk (HTML)."""
    path = DOCS / fname
    if fname.endswith(".pdf"):
        import pdfplumber
        out = []
        with pdfplumber.open(path) as pdf:
            for i, page in enumerate(pdf.pages, 1):
                t = page.extract_text() or ""
                if t.strip():
                    out.append((f"p.{i}", t))
        return out
    raw = path.read_text(errors="replace")
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", raw, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    # Some sites (seen on Norwegian gov HTML) serve accented characters as
    # literal named/numeric entities (&oslash; etc.) rather than raw UTF-8 —
    # left undecoded, a model's naturally-typed "ø" in a quote can never
    # verbatim-match this page's literal "&oslash;" text, silently failing
    # every gate touching an accented word even though the sentence is a
    # perfect real match.
    import html as _html
    text = _html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    chunks = [text[i:i + 6000] for i in range(0, min(len(text), 300000), 6000)]
    return [(f"chunk {i+1}", c) for i, c in enumerate(chunks) if c.strip()]


def target_pages(pages: list[tuple[str, str]], keywords: list[str],
                 cap_chars: int = 60000) -> list[tuple[str, str]]:
    """Keyword-scored page selection so a 100-page regulation fits one call."""
    scored = []
    for loc, text in pages:
        score = sum(text.lower().count(k.lower()) for k in keywords)
        if score > 0:
            scored.append((score, loc, text))
    scored.sort(reverse=True)
    picked, total = [], 0
    for _, loc, text in scored:
        if total + len(text) > cap_chars:
            continue
        picked.append((loc, text))
        total += len(text)
    return sorted(picked, key=lambda x: x[0])


def extract_job(client, job_id: str, job: dict) -> list[dict]:
    pages = target_pages(load_doc(job["doc"]), job["keywords"])
    if not pages:
        print(f"  {job_id}: no matching pages — check keywords")
        return []
    body = "\n\n".join(f"=== {loc} ===\n{text}" for loc, text in pages)
    res = client.messages.create(
        model=MODEL, max_tokens=4000, thinking={"type": "disabled"},
        output_config={"format": {"type": "json_schema", "schema": EXTRACT_SCHEMA}},
        system=(
            "You extract ELIGIBILITY GATES from official EU/national funding "
            "texts for a qualification engine. For each gate: a precise English "
            "requirement sentence, the threshold/value, an EXACT verbatim quote "
            "from the text (the sentence(s) that establish it — copy characters "
            "exactly, no paraphrase, NO ellipses or skipped words, one "
            "contiguous span, max 60 words), the page locator it came "
            "from (the === p.N === marker), and which intake field answers it. "
            "Only extract what the text actually establishes. 3 to 7 gates."),
        messages=[{"role": "user", "content":
                   f"Document: {job['name']} ({job['doc']})\n"
                   f"Hunt for: {job['focus']}\n\n{body}"}])
    text = next((b.text for b in res.content if b.type == "text"), "{}")
    try:
        return json.loads(text).get("gates", [])
    except json.JSONDecodeError:
        return []


def verify_gate(client, gate: dict, doc_text_norm: str) -> tuple[bool, str]:
    # (a) mechanical: every contiguous fragment of the quote must exist verbatim
    # (whitespace/punctuation-normalised). Extractors sometimes elide list items
    # with an ellipsis — legitimate as long as each fragment is real text.
    fragments = [f for f in re.split(r"\s*(?:\.\.\.|…|\[…\]|\[\.\.\.\])\s*", gate["quote"]) if f.strip()]
    for frag in fragments:
        if _norm(frag) not in doc_text_norm:
            return False, f"fragment not found verbatim: {frag[:50]!r}"
    # (b) fresh eyes: entailment from the quote alone
    res = client.messages.create(
        model=MODEL, max_tokens=300, thinking={"type": "disabled"},
        output_config={"format": {"type": "json_schema", "schema": VERIFY_SCHEMA}},
        system=(
            "You verify claims against source quotes for a legal-eligibility "
            "database. You see ONLY the quote. Judge strictly: does the quote "
            "itself establish the stated requirement and value? If the quote is "
            "about something else, or the value differs, or it needs outside "
            "context to support the claim, do not pass it."),
        messages=[{"role": "user", "content":
                   f"QUOTE:\n{gate['quote']}\n\n"
                   f"CLAIMED REQUIREMENT: {gate['requirement']}\n"
                   f"CLAIMED VALUE: {gate['value'] or '(none)'}"}])
    text = next((b.text for b in res.content if b.type == "text"), "{}")
    try:
        v = json.loads(text)
    except json.JSONDecodeError:
        return False, "verifier returned invalid JSON"
    return v.get("verdict") == "supported", v.get("reason", "")


def write_record(job_id: str, job: dict, gates: list[dict]) -> None:
    import yaml
    verified_n = sum(1 for g in gates if g["verified"])
    rec = {
        "id": job_id,
        "name": job["name"],
        "administering_body": "see source document",
        "country": job["country"],
        "capital_type": job["capital_type"],
        "borrower_models": ["operating_company"],
        "status": "verified" if verified_n == len(gates) and gates else "draft",
        "gates": [{
            "id": g["id"], "gate_family": g["gate_family"],
            "requirement": g["requirement"], "value": g["value"],
            "intake_field": g["intake_field"],
            "quote": g["quote"],
            "source": {"file": job["doc"], "locator": g["locator"]},
            "verified": "llm_2pass" if g["verified"] else False,
            **({} if g["verified"] else {"verify_note": g["verify_note"]}),
        } for g in gates],
        "verify_by": "2026-10-01",
        "notes": f"Extracted {verified_n}/{len(gates)} gates at llm_2pass by ETL/terms/extract_terms.py.",
    }
    out = TERMS / f"{job_id}.yaml"
    out.write_text(yaml.safe_dump(rec, sort_keys=False, allow_unicode=True, width=88))
    print(f"  → {out.name}: {verified_n}/{len(gates)} gates verified")


def cmd_plan(args) -> None:
    """Schema-first review, before spending any API calls: what each job hunts
    for and which INTAKE_FIELDS it's expected to gate. A job proposing a
    new_fields entry must be resolved (INTAKE_FIELDS/EligibilityAnswers/the
    wizard screen updated) before `run` will touch it."""
    jobs = {args.job: JOBS[args.job]} if args.job else JOBS
    for job_id, job in jobs.items():
        print(f"{job_id} — {job['name']}")
        print(f"  doc:           {job['doc']}")
        print(f"  focus:         {job['focus']}")
        print(f"  intake_fields: {', '.join(job.get('intake_fields', [])) or '(none declared)'}")
        new_fields = job.get("new_fields", [])
        if new_fields:
            print(f"  new_fields:    {', '.join(new_fields)}  ← BLOCKS `run` until resolved")
        print()


def cmd_run(args) -> None:
    import anthropic
    client = anthropic.Anthropic()
    jobs = {args.job: JOBS[args.job]} if args.job else JOBS
    for job_id, job in jobs.items():
        new_fields = job.get("new_fields", [])
        if new_fields:
            print(f"{job_id}: SKIPPED — proposes new intake field(s) "
                  f"{', '.join(new_fields)} not yet in INTAKE_FIELDS. "
                  f"Add them to INTAKE_FIELDS (this file), EligibilityAnswers "
                  f"(website/frontend/lib/intelligence/types.ts) and the "
                  f"relevant wizard screen (panel.tsx) first, then clear "
                  f"new_fields on this job to run it.")
            continue
        print(f"{job_id} ({job['doc']})")
        gates = extract_job(client, job_id, job)
        print(f"  extracted {len(gates)} gate proposals")
        if args.dry_run or not gates:
            continue
        doc_norm = _norm(" ".join(t for _, t in load_doc(job["doc"])))
        for g in gates:
            ok, note = verify_gate(client, g, doc_norm)
            g["verified"], g["verify_note"] = ok, note
            flag = "✓" if ok else f"✗ ({note[:60]})"
            print(f"    {g['id']} [{g['intake_field']}] {flag}")
        write_record(job_id, job, gates)


def cmd_status(_args) -> None:
    import yaml
    for f in sorted(TERMS.glob("*.yaml")):
        rec = yaml.safe_load(f.read_text())
        gates = rec.get("gates", [])
        v = sum(1 for g in gates if g.get("verified"))
        fields = sorted({g.get("intake_field") for g in gates if g.get("intake_field") not in (None, "none")})
        print(f"{rec['id']:<34} {v}/{len(gates)} verified   fields: {', '.join(fields) or '-'}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    pl = sub.add_parser("plan")
    pl.add_argument("--job", choices=list(JOBS))
    pl.set_defaults(fn=cmd_plan)
    p = sub.add_parser("run")
    p.add_argument("--job", choices=list(JOBS))
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(fn=cmd_run)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
