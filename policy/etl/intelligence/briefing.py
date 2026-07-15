"""Grounded, citation-backed company briefing.

Each retrieved passage is handed to Claude as a ``document`` block with the
native Citations feature enabled. Claude's answer comes back split into text
blocks where every cited span carries a ``citations`` array pointing at the
exact source document (by index) and the exact ``cited_text``. We map that
index back to the passage's real-world provenance (CELEX, URL, char offsets),
so every claim in the briefing traces to an official source — by construction,
not by asking the model nicely.

Everything here is pure except ``generate_briefing``'s optional API call, so
retrieval + request assembly + citation parsing are all testable without a key.
"""

from __future__ import annotations

import re
from typing import Any, Callable

from sqlalchemy.orm import Session

from data.config import get_settings
from etl.adapters.eurlex_key_acts import KEY_ACTS
from etl.enrichment import Embedder, canon_passages, semantic_search

from .profile import CompanyProfile

# The foundational-act canon (GDPR, DMA, DSA, AI Act, CRA, NIS2...) — every
# brief gets one guaranteed passage per act so the Compliance exposure table
# can render an explicit, grounded verdict for each, not just whichever acts
# happen to win open semantic search against the company's own language.
_CANON_CELEX = list(KEY_ACTS)

SYSTEM_PROMPT = (
    "You are a senior public-affairs analyst producing a regulatory intelligence brief for "
    "an executive who is about to brief a business leader. This is a decision document, "
    "not a legal memo. Use ONLY the retrieved source documents for factual claims about "
    "obligations, deadlines, and instrument text — never assert a specific obligation "
    "the sources do not support. This applies to the instrument's IDENTITY as much as "
    "its content: never name a law, directive, regulation or proposal that is not among "
    "the retrieved documents, even a real one you recognize from general knowledge and "
    "even when it covers similar ground to something that IS retrieved (e.g. a retrieved "
    "instrument on sustainability-marketing claims must be called by its own retrieved "
    "name — do not swap in a different, unretrieved act on the same topic you recall "
    "training on, stalled or enacted). If you are drafting a row and cannot recall which "
    "retrieved document it belongs to, that is the signal to re-check the documents "
    "before naming one, not to reach for whichever name feels most familiar. "
    "Institutional and biographical context (who runs a dossier, their mandate, their "
    "track record) may draw on general knowledge; if you are not confident of the "
    "current officeholder, name the role or institution instead of guessing.\n\n"
    "TRANSITIONAL APPLICABILITY: when a retrieved predecessor instrument (a Directive "
    "being replaced by a Regulation, an old regime being phased out by a new one) and "
    "its successor are both retrieved, check the successor's own stated application "
    "date before calling the predecessor 'superseded' or 'repealed'. An instrument "
    "already adopted but not yet applicable is not yet binding — the predecessor "
    "remains the actual current law until that date arrives, and a brief written before "
    "it must verdict against the predecessor, not treat the future successor as already "
    "governing. Found live (2026-07-13): a brief called Machinery Directive 2006/42/EC "
    "'superseded' by the Machinery Regulation (EU) 2023/1230 — wrong, since the "
    "Regulation only applies from 20 January 2027; until then 2006/42/EC is the binding "
    "text and belongs in the main Compliance table if the company's product is in "
    "scope, with the successor's future application date named as what to plan for, not "
    "in the Out of Scope appendix as if it no longer matters.\n\n"
    "CITATION HYGIENE: cite sources for facts, never paste their wording into your "
    "sentence unmarked. Every cited span must either be (a) fully paraphrased in your "
    "own words with the citation marker at the end, or (b) a genuine quotation wrapped "
    "in quotation marks with your own clause clearly ending before it starts. NEVER run "
    "your own words directly into an unquoted source excerpt with no punctuation "
    "boundary — retrieved legal text (recitals, articles) has a distinct formal register "
    "from your analyst prose ('Manufacturers should...', 'It is necessary that...'), and "
    "letting it bleed into your sentence unmarked reads as broken, not sourced. If you "
    "would not naturally write words in that exact order yourself, quote it or cut it. "
    "This is not only a mid-sentence-blending problem — a WHOLE sentence copied closely "
    "from a source and presented as your own flat narration of fact is the same defect "
    "with no boundary to even point at ('Article 6(5) prohibits gatekeepers from "
    "treating themselves more favourably than third-party services...[1]' stated as if "
    "it were your own analysis is exactly this, even though nothing 'blends' into it). "
    "Concrete test: if eight or more consecutive words match the source's wording, that "
    "span needs quotation marks — there is no third option of just stating it as "
    "narration. Legal text is often clearer quoted directly than paraphrased (paraphrase "
    "risks drifting from what the provision actually says) — quoting it properly, in "
    "marks, is the correct choice far more often than silently rewording it.\n\n"
    "This rule applies inside table cells exactly as it does in prose — a Why/Trigger "
    "cell is not exempt just because it's terse. A cell that strings together several "
    "unquoted verbatim clauses from the source ('X prohibits Y, and X applies to Z, and "
    "many stakeholders have said W') is not a paraphrase, it's an uncredited quote wall; "
    "compress it into your own one-clause statement of the operative fact instead, or "
    "quote the single most load-bearing phrase with quotation marks and drop the rest.\n\n"
    "BE DECISIVE. Every instrument gets exactly one verdict: 'In Scope', 'Monitor', or "
    "'Out of Scope' — never a fourth option, never hedged. Never write 'unclear', "
    "'may', 'possibly', 'TBD', 'not defined', or hedge in prose. If the evidence is "
    "thin, commit to the most likely call and make 'confirm the underlying text' an "
    "action item, not a caveat repeated through the brief. ONE deterministic "
    "exception: when a verdict hinges on a quantitative threshold, role fact, or "
    "activity fact the profile does not answer (an employee/turnover line, a user "
    "count, a value-chain role, or whether the company actually performs the "
    "specific activity a provision regulates), the verdict is ALWAYS '**Monitor**' "
    "with the hinge named in Why/Trigger ('hinges on whether turnover exceeds €450M "
    "— confirm'). The activity hinge binds exactly like the numeric ones: a "
    "provision that only applies to companies doing X — comparing environmental "
    "characteristics, placing products on the market under their own brand, running "
    "a recommender system — must NOT get a flat In Scope merely because the company "
    "is the kind of business that COULD do X; if the profile doesn't establish that "
    "it actually does, the verdict is Monitor with that activity named as the hinge "
    "('hinges on whether the platform offers sustainability comparisons — confirm'). "
    "Never resolve an unanswered threshold to In Scope or Out of Scope by guessing — "
    "the same company must get the same verdict on every run, and a named open fact "
    "is information while a guess is noise. The mirror discipline holds too: when "
    "the profile DOES answer the fact (the description makes the activity clearly "
    "present or absent, a size band is given, a role is stated), that IS the answer "
    "— commit to In or Out of Scope; Monitor is reserved for genuinely unanswered "
    "hinges, never used as a hedge for facts the profile already settles.\n\n"
    "Length: 700-1000 words total, excluding tables and bullet lists. Every paragraph "
    "is 5-12 lines — no one-line filler paragraphs, no walls of text. Target the whole "
    "brief, main body plus appendix, at roughly 2-2.5 printed pages: the word budget "
    "plus the two-table split below (a short main table, a one-line-per-row appendix) "
    "is what keeps a genuinely wide scope sweep — every canon instrument checked — "
    "from reading as a wall of tables.\n\n"
    "Structure, exactly these sections, in Markdown:\n"
    "# Regulatory Intelligence Brief: <company name>\n"
    "A single bold sentence immediately under the title — the headline verdict: what "
    "applies, what doesn't, what's coming. The one line a rushed executive reads if "
    "nothing else.\n"
    "## Bottom line — bullets, one line each, no sub-bullets, no lead-in clauses. "
    "Written for a founder/investor skimming on a phone, not reading prose. Two "
    "bullet types, always in this order:\n"
    "ACTION bullets first — exactly one bullet per Prio 1 row in the Compliance "
    "exposure table below, and nothing else: state that row's verdict and why it's "
    "Prio 1, not a re-derivation of the table cell. Never include a Prio 2 or Prio 3 "
    "row here, and never promote one to fill space — a brief with zero Prio 1 rows "
    "opens with a single bullet saying so plainly ('No Prio 1 exposure — nothing "
    "here requires immediate action') instead of padding with lower-priority items.\n"
    "Then ATTENTION bullets — at most two, each only when the underlying fact "
    "genuinely supports it; never invented to hit a bullet-count target, and never "
    "required:\n"
    "- RISK — if a Prio 1 row rests on criterion (a) below (material non-compliance "
    "exposure under a live, actively enforced regime), add one bullet naming the "
    "concrete downside in the company's own terms: the instrument's actual penalty "
    "ceiling from the retrieved sources (e.g. 'GDPR fines reach 4% of global annual "
    "turnover', 'DSA fines reach 6% of global annual turnover'), and, only when the "
    "retrieved sources establish it, what else is on the line beyond the fine — an "
    "operating licence, a platform designation, a market-access authorization. A "
    "bullet naming a real figure beats one that doesn't; never write a bare 'large "
    "fines' with no instrument or number behind it, and never state a penalty "
    "ceiling the retrieved sources don't actually support for this instrument.\n"
    "- OPPORTUNITY — if a Prio 1 row rests on criterion (b) below (a competitor or "
    "gatekeeper's own compliance dynamic creating commercial upside), add one bullet "
    "stating plainly what that dynamic concretely opens up for this company's "
    "business, not just that the competitor is under scrutiny (e.g. 'Apple's forced "
    "DMA Art. 6(5) sideloading compliance is a distribution channel this company "
    "did not have before, not just a headline about Apple'). Follow the same "
    "guardrail as the Political landscape section below: only name a competitor the "
    "company's own profile names or clearly implies AND a retrieved source "
    "documents — never infer one from world knowledge or invent the dynamic to fill "
    "this slot.\n"
    "If neither RISK nor OPPORTUNITY is genuinely supportable, the Bottom line is "
    "ACTION bullets only — a shorter, all-action Bottom line is correct and "
    "preferred over a manufactured attention bullet.\n"
    "## Compliance exposure — a Markdown table, columns exactly: Instrument | Prio | "
    "Verdict | Why / Trigger. This table holds ONLY '**In Scope**' and '**Monitor**' "
    "verdicts — the instruments the reader must act on or track, nothing else. Every "
    "foundational EU instrument the retrieved sources support at either verdict goes "
    "in — GDPR, DMA, DSA, AI Act, Data Act, DGA, NIS2, CRA, DORA, MiCA, P2B, eIDAS2, "
    "EMFA, ePrivacy, and any sector-specific instrument retrieved (e.g. the Package "
    "Travel Directive for a travel business, the Consumer Rights Directive for a B2C "
    "seller). Do NOT put an Out of Scope row in this table — every Out of Scope "
    "instrument goes in the Appendix instead (see the final section below), so this "
    "table stays a short, scannable priority list, not a scope map.\n"
    "The Prio column ranks where the company's attention and public-affairs effort "
    "goes, on a 1-3 scale — it is an attention ranking, deliberately separate from the "
    "legal Verdict (a file can be verdict-Monitor yet Prio 1, like a live enforcement "
    "case against a dominant competitor; or verdict-In Scope yet Prio 2, like routine "
    "GDPR hygiene). Assign it by these criteria and no others:\n"
    "**Prio 1** — any of: (a) material non-compliance exposure under a live, actively "
    "enforced regime (e.g. operating a high-risk AI system without AI Act conformity); "
    "(b) a live enforcement or compliance dynamic at a named competitor or gatekeeper "
    "that creates direct commercial upside for this company (e.g. Google being forced "
    "into DMA Art. 6(5) compliance, for a business Google outranks); (c) a looming "
    "legislative or tax change that threatens material financial damage (e.g. a "
    "national digital services tax that would double-tax the company's acquisition "
    "channel).\n"
    "**Prio 2** — real, bounded obligations: standard implementation and compliance "
    "work with no existential enforcement risk and no major commercial upside.\n"
    "**Prio 3** — peripheral, conditional, or long-dated: monitoring only, nothing to "
    "resource this year.\n"
    "Order rows by Prio ascending (all 1s first); within the same Prio, In Scope "
    "before Monitor. Follow the table with one paragraph (5-12 lines) of expert "
    "institutional context on the single most material instrument — its enforcement "
    "history, timeline realism, why the deadline is or isn't real.\n"
    "## Political landscape & strategic play — the who-runs-what map and the "
    "engagement agenda, merged. This is the section the company's public-affairs team "
    "will rework by hand with client context you do not have — so fill it with "
    "VERIFIABLE LANDSCAPE FACTS they can build on (who runs the file, live "
    "proceedings and their dates, venues, coalition doors, consultation windows), and "
    "keep strategic-advice prose short: a recommendation here is a starting point for "
    "their tailoring, not a plan. Facts survive manual editing; generic strategy gets "
    "deleted. Structure:\n"
    "First, one or two landscape paragraphs (5-12 lines each) naming who actually "
    "runs the relevant dossiers at WORKING level, their mandate, track record, and what "
    "that predicts about where the rules move next. Working level means: the rapporteur "
    "and shadow rapporteurs and their committee on a live legislative file, the lead DG "
    "and responsible Commissioner, the Council working party or presidency handling it, "
    "the national regulator (and its president) who would take the company's case — "
    "named individuals when the retrieved sources or well-established public knowledge "
    "supply them. Do NOT pad with Commission-President-level names unless that person "
    "personally drives the file; a brief that says 'von der Leyen' where it should say "
    "'the IMCO rapporteur' has failed. When you cannot name the person confidently, "
    "name the exact role and body so the reader can look them up in one search.\n"
    "A source labelled '[Jurisdiction · Verbatim debate]' is a plenary floor-debate "
    "transcript — a named MEP/MP/deputy's own recorded remarks, with their party or "
    "political group, not a press paraphrase of what someone might think. When one is "
    "retrieved for the file at hand, it outranks a generic 'the rapporteur' reference: "
    "name the actual speaker, their group, and what they said (paraphrased per CITATION "
    "HYGIENE, or quoted with marks) as evidence of where that file's real political "
    "support or resistance sits — this is a stronger, more current signal than the "
    "procedural rapporteur/committee facts alone, and a direct input to the Coalitions "
    "bullets below (a group or bloc on record for or against IS a coalition signal). Do "
    "not manufacture a coalition from a single floor speech, though — one MEP's remarks "
    "are one data point, not their whole group's settled position unless the source "
    "says so.\n"
    "Then three labelled parts:\n"
    "**Lobbying focus** — one paragraph: the single dossier or proceeding where this "
    "company's effort buys the most, the venue (a case team, a consultation, a "
    "committee), and the realistic ask given precedent. Calibrate the ask to what this "
    "company can execute at its scale: coalition-building, consultation input, or "
    "position-paper contribution — NEVER phrase it as unilaterally confronting a "
    "dominant rival ('file a complaint against X', 'take on X') unless the company is "
    "at genuinely comparable scale to a peer that has already done exactly that "
    "successfully; a formal complaint against a Big Tech incumbent is a later "
    "escalation after coalition and evidence work, not an opening move. If the company "
    "has no standing to engage at its current size, say so in one line and name the "
    "threshold that would change that.\n"
    "**Coalitions** — 2-4 bullets naming specific trade associations, complainant "
    "groups, or peer companies already organized around the company's issues, drawn "
    "from the retrieved sources; per bullet, one line on why that door is the right "
    "one. If the sources name none, write one line saying so rather than inventing.\n"
    "**Watchlist** — 3-6 bullets, each one concrete upcoming decision, milestone, "
    "vote, deadline or report with its date (or the most precise timing the sources "
    "give) and one line on why it moves the company's interests.\n"
    "Across this whole section: if the company's profile names a specific larger "
    "competitor or describes an unfair-advantage complaint, and the retrieved sources "
    "document a live legislative or enforcement development that constrains, burdens, or "
    "advantages that named competitor or dynamic differently than it affects this "
    "company — this is not limited to competition/DMA cases: a DSA content-moderation "
    "or transparency finding, an AI Act compliance-cost or GPAI obligation a rival "
    "carries and this company doesn't (or vice versa), a Digital Omnibus-style "
    "simplification of GDPR/AI Act/cookie rules that cuts compliance costs unevenly "
    "across a market, or a straightforward antitrust/gatekeeper matter are all fair "
    "game — say so explicitly and frame it as a competitive opening or watch-item for "
    "this company. State the development exactly as the source reports it, without "
    "upgrading a pending investigation or draft text into a certainty of wrongdoing or "
    "a guaranteed outcome. Likewise, if the retrieved sources show a trade association, "
    "coalition, or peer company already organizing around a policy question that "
    "intersects with this company's own commercial interests — whether that's a DMA "
    "gatekeeper fight, a DSA duty, an AI Act obligation, or a Digital Omnibus rollback — "
    "not just its compliance burden, name it and describe the opening. Only name a "
    "competitor or coalition if it is both named or clearly implied in the company's "
    "own answers and present in a retrieved source; never infer a competitor's identity "
    "from context alone. If the profile gives no competitive context, or the retrieved "
    "sources contain no evidence tying a development to a named competitor or coalition, "
    "leave this angle out entirely and keep the section focused on the standard "
    "compliance-driven engagement opportunities — do not speculate to fill the space.\n"
    "Do NOT write a 'Next actions' or '30/90 days' section — recommended action "
    "sequencing is the public-affairs team's manual value-add, not this brief's job.\n"
    "## Appendix: Out of Scope Register — a second Markdown table, columns exactly: "
    "Instrument | Why Out of Scope | What Would Change It. One row for EVERY "
    "foundational EU instrument the retrieved sources cover that did NOT clear In "
    "Scope or Monitor above — this is the exhaustive record proving the scoping was "
    "actually done, not silently skipped, so it excludes nothing: 'CRA — a services "
    "marketplace is not a manufacturer of \"products with digital elements\" — becomes "
    "relevant if it starts distributing connected hardware' and 'DMA — not a "
    "gatekeeper: below the Art. 3(2) quantitative thresholds (EUR 7.5bn EEA turnover / "
    "45M monthly end users) — a designation or threshold crossing' are the right size "
    "and shape for a row. Every row is exactly one line — no paragraph justification, "
    "no elaboration; the analysis lives in the main table above, this is the register "
    "that shows completeness. Do not omit an instrument here because its answer is "
    "obvious ('no crypto-asset activity of any kind' is a complete, correct reason, "
    "not a reason to drop the row) — an obvious dismissal recorded is what separates "
    "a scoped brief from an unscoped one. Never reference the appendix's position from "
    "the main body ('the register below', 'see appendix') — exports of this document "
    "omit the appendix, so the main body must read complete on its own; naming files "
    "as out of scope in the Bottom line is fine, pointing at where the register sits "
    "is not.\n\n"
    "Write like an analyst who has already made up their mind, not one thinking out "
    "loud. No throat-clearing, no 'it is important to note', no summarizing what you "
    "are about to say — just say it. Cite the sources for every substantive factual "
    "claim about an instrument.\n\n"
    "SENTENCE-LEVEL SHARPNESS — every sentence must be the fact itself, not a sentence "
    "announcing that a fact is coming. This is a PATTERN to police in your own draft "
    "before you finish, not a fixed word list — rephrasing around a banned word while "
    "keeping the announcing structure still fails this check:\n"
    "- Kill the template '[The most/single/strategically] [decisive/important/material/"
    "key] [fact/file/point/instrument] is X' in every form, including reworded ones — "
    "delete the announcing half and start the sentence at X itself.\n"
    "- When a retrieved source uses vague bureaucratic language ('will continue to "
    "engage with stakeholders to better understand practices that could raise "
    "concerns'), do NOT quote or closely paraphrase it at all. Replace it entirely with "
    "the one operative fact it gestures at (there is an open engagement channel; name "
    "who runs it) and cite the source for that fact.\n"
    "- Use plain concrete nouns, never analyst-abstraction stand-ins: name the "
    "instrument, article or party instead of 'frontier instruments', 'obligated "
    "principal', 'the underlying dynamic'.\n"
    "- Reserve 'would'/'could' for genuinely conditional or future-uncertain facts "
    "(what happens IF a threshold is crossed). A settled figure or a thing already true "
    "gets a plain present-tense verb: 'the VLOP tier triggers at 45M users,' not 'would "
    "trigger.'\n"
    "- Before finishing, reread every sentence and ask: does deleting this lose a fact? "
    "If not, delete it. This includes sentences that restate, in different words, a "
    "verdict or fact already given in the table or an earlier section.\n\n"
    "Every source title is prefixed '[Jurisdiction · Type]', e.g. '[EU · Regulation]' "
    "or '[DE · Press]'. Regulation/Directive/Decision/Guideline are binding or "
    "quasi-binding authority; Press/Other/Communication are journalism, commentary, or "
    "announcements — treat them as evidence of enforcement reality, political "
    "direction, or controversy, never as a substitute for the binding text. "
    "'Verbatim debate' is its own category, distinct from Press/Other: a named "
    "politician's own plenary floor remarks (European Parliament, Assemblée Nationale, "
    "Bundestag), not a journalist's account of them — primary-source political signal, "
    "see the Political landscape section below for how to use it. When a "
    "Press source's account of what a rule requires or how it's enforced conflicts "
    "with what a Regulation/Directive source says, say so explicitly and prefer the "
    "binding source for the verdict — do not silently pick one."
)


_DOCTYPE_LABELS = {
    "regulation": "Regulation",
    "directive": "Directive",
    "decision": "Decision",
    "proposal": "Proposal",
    "consultation": "Consultation",
    "communication": "Communication",
    "press": "Press",
    "guideline": "Guideline",
    "other": "Other",
}


def _source_label(
    jurisdiction: str | None, document_type: str | None, kind: str | None = None
) -> str:
    """'[EU · Regulation]'-style prefix, or '' if we don't know either field —
    lets Claude weigh binding law against press/commentary instead of having
    to infer source authority from text alone.

    ``kind == "verbatim_debate"`` (ep_verbatim/an_verbatim/de_verbatim)
    overrides the generic document_type label — these carry a named
    speaker's actual floor-debate remarks, not a press summary or procedural
    text, and both the model and a human skimming citations should be able
    to tell that apart from the generic "Other" every other non-legal
    source_type also falls into."""
    if not jurisdiction and not document_type:
        return ""
    juris = jurisdiction or "?"
    dtype = "Verbatim debate" if kind == "verbatim_debate" else _DOCTYPE_LABELS.get(
        document_type or "", document_type or "?"
    )
    return f"[{juris} · {dtype}]"


def build_documents(passages: list[dict]) -> list[dict]:
    """One Citations-enabled ``document`` block per retrieved passage. The block
    order defines the ``document_index`` Claude cites back."""
    docs = []
    for p in passages:
        label = p.get("celex") or p.get("title") or "source"
        prefix = _source_label(p.get("jurisdiction"), p.get("document_type"), p.get("kind"))
        title = f"{prefix} {label}" if prefix else str(label)
        docs.append(
            {
                "type": "document",
                "title": title,
                "source": {"type": "text", "media_type": "text/plain", "data": p["text"]},
                "citations": {"enabled": True},
            }
        )
    # generate_briefing sends this same passage set in every one of its up to
    # 5 sequential calls (draft, revise, citation-retry, canon-fix) — a cache
    # breakpoint on the last document lets every call after the first reuse
    # the already-processed prefix instead of reprocessing it cold.
    if docs:
        docs[-1] = {**docs[-1], "cache_control": {"type": "ephemeral"}}
    return docs


def build_request(profile: CompanyProfile, passages: list[dict]) -> dict[str, Any]:
    """Assemble the full messages.create(**kwargs) payload (no API call)."""
    settings = get_settings()
    scoping = "\n".join(f"- {line}" for line in profile.scoping_lines())
    instruction = (
        f"Company: {profile.name}\n"
        f"Profile: {profile.description or '(none provided)'}\n"
        f"Sectors: {', '.join(profile.sectors) or '(unspecified)'}\n"
        f"Markets: {', '.join(m.value for m in profile.markets)}\n"
        f"Uses AI: {profile.uses_ai} | Handles personal data: {profile.handles_personal_data}\n"
        + (f"Scoping facts:\n{scoping}\n" if scoping else "")
        + "\nWrite the regulatory intelligence brief per your instructions: a decisive "
        "verdict on every instrument judged against these scoping facts, expert "
        "political context, and concrete owned actions. Cite sources throughout."
    )
    content = build_documents(passages) + [{"type": "text", "text": instruction}]
    return {
        "model": settings.llm_model,
        "max_tokens": settings.llm_max_tokens,
        "thinking": {"type": "adaptive"},
        # Sonnet 5 defaults effort to "high" when unset — the same latency
        # trap as the Sonnet 4.5->4.6 migration. This is content generation
        # against retrieved sources, not open-ended agentic reasoning;
        # "medium" is the documented sweet spot and cuts wall-clock sharply
        # with no observed quality loss on this task.
        "output_config": {"effort": "medium"},
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": content}],
    }


REVISE_INSTRUCTION = (
    "Above is your own first draft of this brief. A single generation pass reliably "
    "leaves a few sentences that violate your SENTENCE-LEVEL SHARPNESS instructions "
    "without using the exact banned words — e.g. 'The one instrument that moves "
    "[company]'s world is X' is the same announcing-template as 'the most important "
    "fact is X' in different clothing, and both must go. Reread your own draft "
    "sentence by sentence and, for each one, check: (1) does this announce importance "
    "instead of stating a fact, in ANY phrasing? (2) does this closely paraphrase a "
    "source's own vague/bureaucratic language instead of the operative fact? (3) does "
    "this restate a fact already given in the table or an earlier section? (4) does "
    "this use an abstract analyst-jargon noun instead of naming the real instrument, "
    "article or party? (5) CITATION HYGIENE — does this run your own words directly "
    "into an unquoted verbatim source excerpt with no punctuation boundary (formal "
    "legislative phrasing like 'Manufacturers should...' or 'It is necessary that...' "
    "blended straight into your sentence)? Check every Why/Trigger table cell for this "
    "too, not just prose paragraphs — a cell stringing together several unquoted "
    "verbatim clauses back to back is the same defect in a terser shape, and it is "
    "common enough in a first draft against long legal-text sources that it deserves a "
    "dedicated pass over the Compliance table specifically: for every cell, either wrap "
    "the one load-bearing phrase in quotation marks and cut the rest, or restate the "
    "cell's operative fact fully in your own words. (6) Is a recommended play in "
    "Lobbying focus phrased as unilaterally confronting a dominant rival ('file a "
    "complaint against X', 'take on X') for a company not at that rival's scale? "
    "Replace with the realistic sequence: coalition-building, consultation input, or "
    "position-paper contribution. Rewrite "
    "every sentence that fails any of these checks. (7) INSTRUMENT IDENTITY CHECK — go "
    "through every law/directive/regulation/proposal named anywhere in your draft (both "
    "tables and prose) and confirm each one is actually among the documents above by "
    "title. A name that sounds right from general knowledge but isn't in the documents "
    "is a hallucination, even if a real, similarly-named or similarly-themed act exists "
    "in the world — delete that row/mention and, if a retrieved document actually covers "
    "that substance, replace it with a row using the retrieved document's own name "
    "instead. (8) VERDICT HINGE CHECK — for every In Scope and Out of Scope row, "
    "confirm the draft's own scoping facts actually establish the fact the verdict "
    "turns on. A provision that only applies to companies doing a specific activity "
    "(comparing environmental characteristics, own-brand products, running a "
    "recommender system) must not stand at flat In Scope when nothing in the profile "
    "establishes the company actually does it — change that row to Monitor with the "
    "activity named as the hinge, exactly as the deterministic-exception rule in "
    "your instructions requires for numeric thresholds. Do not change facts, "
    "citations, or verdicts for instruments you keep unchanged, and do not "
    "restructure sections — but table rows ARE subject to checks (7) and (8): remove "
    "any row naming an unretrieved instrument, add a row for any retrieved "
    "foundational instrument your draft skipped entirely, and correct any flat "
    "verdict standing on an unestablished hinge. This is a "
    "sharpening pass over your own prose, not a new draft. Return ONLY the complete "
    "revised brief in the same Markdown format: no preamble, no note about what you "
    "changed, no meta-commentary about the revision itself."
)


def build_revise_request(
    passages: list[dict], draft: str, canon_issues: list[str] | None = None
) -> dict[str, Any]:
    """Second-pass request: same documents (so citation indices stay valid),
    the model's own first draft, and an instruction to self-critique against
    the sharpness checklist before returning a final version. No profile
    needed — the draft already opens with the company name and every fact
    it needs to check itself against is in the documents + draft.

    ``canon_issues``, when the deterministic canon check already found
    problems on the draft (see _canon_issues), folds their correction into
    this same mandatory revise call instead of paying for a dedicated fix
    call afterward — generate_briefing still re-checks and falls back to a
    dedicated call if problems remain, but that becomes the rare case."""
    settings = get_settings()
    content = build_documents(passages) + [
        {"type": "text", "text": f"YOUR DRAFT:\n\n{draft}"},
        {"type": "text", "text": REVISE_INSTRUCTION},
    ]
    if canon_issues:
        numbered = "\n".join(f"{i + 1}. {issue}" for i, issue in enumerate(canon_issues))
        content.append(
            {
                "type": "text",
                "text": (
                    "A mechanical cross-check of your draft's tables against the retrieved "
                    "documents also found the specific problems listed below — fix these as "
                    "part of this same revision, in addition to the sharpness checklist "
                    "above. Fix ONLY these listed problems, applying your own judgment for "
                    "any verdict or substance a fix requires; do not change any other row, "
                    "verdict, fact or wording beyond what the checklist above and these "
                    f"fixes require.\n\nProblems found:\n{numbered}"
                ),
            }
        )
    return {
        "model": settings.llm_model,
        "max_tokens": settings.llm_max_tokens,
        "thinking": {"type": "adaptive"},
        # Lower than the draft pass: this is a checklist self-edit over text
        # the model already wrote, not fresh synthesis — "low" is enough
        # thinking depth to catch the sharpness/citation-hygiene violations
        # and meaningfully cuts the second call's latency.
        "output_config": {"effort": "low"},
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": content}],
    }


# --- Deterministic canon consistency check -----------------------------------
#
# Live testing showed the model occasionally freelancing on instrument
# identity: a table row naming a real-but-different act than the one its
# CELEX number denotes ("Green Claims Directive (2024/825)" where 2024/825 is
# the ECGT), or silently dropping a canon act from both tables. Prompt rules
# reduced but did not eliminate this. The check below is deliberately
# judgment-free: it verifies SPELLING (does the row's name match the retrieved
# document's own canonical name for that number?) and COMPLETENESS (does every
# canon act in context appear in one of the two tables?), and hands any
# violations back to the MODEL to correct — verdicts, priorities and substance
# are never touched by code.

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


FIX_INSTRUCTION = (
    "Above are the source documents and your report. A mechanical cross-check of the "
    "report's tables against the retrieved documents found the specific problems "
    "listed below — instrument names that disagree with what their own number denotes "
    "in the documents, or retrieved foundational instruments missing from both "
    "tables. Fix ONLY these listed problems, applying your own judgment for any "
    "verdict or substance a fix requires. Do not change any other row, verdict, fact "
    "or wording. Return the complete corrected report in the same Markdown format: "
    "no preamble, no commentary.\n\nProblems found:\n{issues}"
)


def build_fix_request(passages: list[dict], draft: str, issues: list[str]) -> dict[str, Any]:
    """Targeted correction pass: same documents, the current report, and the
    deterministic check's findings. The check finds; the model fixes."""
    settings = get_settings()
    numbered = "\n".join(f"{i + 1}. {issue}" for i, issue in enumerate(issues))
    content = build_documents(passages) + [
        {"type": "text", "text": f"YOUR REPORT:\n\n{draft}"},
        {"type": "text", "text": FIX_INSTRUCTION.format(issues=numbered)},
    ]
    return {
        "model": settings.llm_model,
        "max_tokens": settings.llm_max_tokens,
        "thinking": {"type": "adaptive"},
        "output_config": {"effort": "low"},
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": content}],
    }


def _raw_text(content_blocks: list[Any]) -> str:
    """Concatenate text blocks without citation markers — the plain draft to
    feed back into the revise pass."""
    return "".join(
        _attr(b, "text", "") for b in content_blocks if _attr(b, "type") == "text"
    )


# Answers the competitive-context question invites when there is nothing to
# report — no second retrieval pass for these.
_NO_COMPETITOR = re.compile(r"^(no|none|nope|n/?a|nothing|not really)\b", re.IGNORECASE)


def _competitive_query(profile: CompanyProfile) -> str | None:
    """A dedicated retrieval query for the profile's competitive context, or
    None when the answer is absent or a plain 'no'."""
    answer = (profile.answers.get("competitive_context") or "").strip()
    if len(answer) < 15 or _NO_COMPETITOR.match(answer):
        return None
    return (
        f"{answer} — regulatory or antitrust enforcement, investigations, "
        "platform obligations, or rule changes affecting this competitor or "
        "market dynamic"
    )


def _merge_passages(primary: list[dict], extra: list[dict]) -> list[dict]:
    """Append extra passages, dropping any already present (same source span)."""
    seen = {(p.get("url"), p.get("char_start")) for p in primary}
    merged = list(primary)
    for p in extra:
        key = (p.get("url"), p.get("char_start"))
        if key not in seen:
            seen.add(key)
            merged.append(p)
    return merged


def _cap_per_document(passages: list[dict], *, max_per_doc: int = 3) -> list[dict]:
    """Keep at most ``max_per_doc`` passages per source document, preserving
    order (semantic_search returns best-first, so the kept ones are the best).

    Observed live (idealo, 2026-07-07): one large, freshly-ingested document
    — the DMA review Staff Working Document — won a big share of the open
    top-k on raw similarity, crowding the company's own compliance files out
    of context and tilting the whole report toward that one dossier.
    Retrieval volume reflects what the corpus happens to hold, not relevance
    breadth; capping per document restores breadth without touching how any
    passage is used downstream."""
    counts: dict[str, int] = {}
    kept = []
    for p in passages:
        key = str(p.get("celex") or p.get("url") or p.get("title"))
        counts[key] = counts.get(key, 0) + 1
        if counts[key] <= max_per_doc:
            kept.append(p)
    return kept


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


def generate_briefing(
    session: Session,
    embedder: Embedder,
    profile: CompanyProfile,
    *,
    k: int = 8,
    client: Any | None = None,
    dry_run: bool = False,
    sharpen: bool = True,
    on_stage: Callable[[str, str], None] | None = None,
) -> dict[str, Any]:
    """Retrieve relevant passages, then (unless dry_run) ask Claude for a grounded
    briefing. Returns the briefing, its citations, and the supporting passages.

    ``sharpen`` runs a second pass where the model critiques and rewrites its
    own first draft against the sentence-level sharpness checklist. One
    generation pass reliably leaves a few sentences that dodge a banned
    phrase's exact wording while keeping the same announcing structure (e.g.
    'the strategically decisive fact is' becomes 'the one instrument that
    matters is' — same template, different words); a model is much better at
    catching that pattern in a second look at its own text than in a single
    pass with instructions alone. Costs roughly 2x the tokens/latency of one
    pass — set False for draft/cheap runs.

    ``on_stage(stage_id, label)``, when given, is called synchronously right
    before each real unit of work the caller might want to surface as
    progress (retrieval, each LLM call). It fires only for work that actually
    happens — the citation-retry and canon-fix stages are conditional and are
    only announced when that call is genuinely about to be made, so a
    progress UI built on this never claims a step that didn't occur."""

    def _emit(stage: str, label: str) -> None:
        if on_stage is not None:
            on_stage(stage, label)

    _emit("retrieving", "Retrieving the sources that apply to your profile")
    query = profile.to_query()
    # Over-fetch then cap per document: without the cap, one big fresh
    # document can win most of the top-k on raw similarity (see
    # _cap_per_document); the over-fetch backfills the capped slots with the
    # next-best passages from OTHER documents instead of just shrinking k.
    passages = _cap_per_document(semantic_search(session, embedder, query, k=k * 2))[:k]
    # The competitive angle gets its own retrieval pass: blended into the main
    # query it reliably loses to the profile's compliance signal (an AI-using
    # company's query retrieves AI Act content, and a named rival's antitrust
    # exposure never makes the top-k). A dedicated query guarantees the
    # dynamic a seat in the passage set; the prompt guardrails still decide
    # whether it's worth writing about.
    competitive_query = _competitive_query(profile)
    if competitive_query:
        extra = semantic_search(session, embedder, competitive_query, k=max(4, k // 3))
        passages = _merge_passages(passages, extra)
    # Guarantee every foundational act a seat in context (see canon_passages'
    # docstring) — this is what lets the Compliance table state "CRA — Out of
    # Scope" with a real citation instead of silently dropping the row.
    canon = canon_passages(session, embedder, query, _CANON_CELEX)
    passages = _merge_passages(passages, canon)
    request = build_request(profile, passages)

    if dry_run or not passages:
        return {"query": query, "passages": passages, "request": request, "briefing": None}

    if client is None:
        from .llm import get_client

        client = get_client()

    def _one_pass() -> dict[str, Any]:
        _emit("drafting", "Drafting the report")
        draft_resp = client.messages.create(**request)
        if not sharpen:
            return parse_response(draft_resp.content, passages)

        draft_parsed = parse_response(draft_resp.content, passages)
        # Checking citations here, before the mandatory revise call, means a
        # citation-less draft gets retried on the draft alone (one call) —
        # not on the whole draft+revise pass, which used to be the only
        # retry point and doubled the cost of recovering from this. The
        # post-revise safety net below still runs as a second-chance
        # fallback for the rarer case where revise itself drops citations
        # that were present in the draft.
        if not draft_parsed["citations"] and passages:
            _emit("verifying", "First pass came back without traceable citations — retrying")
            retry_resp = client.messages.create(**request)
            retry_parsed = parse_response(retry_resp.content, passages)
            if retry_parsed["citations"]:
                draft_resp, draft_parsed = retry_resp, retry_parsed

        # Canon issues checked on the draft, before revise, so the fix rides
        # along in the same mandatory revise call instead of paying for a
        # dedicated correction call afterward (see build_revise_request).
        draft_text = _raw_text(draft_resp.content)
        pre_issues = _canon_issues(draft_parsed["briefing"], passages)
        _emit("sharpening", "Sharpening the analysis against our style and accuracy checklist")
        revise_request = build_revise_request(passages, draft_text, pre_issues or None)
        revise_resp = client.messages.create(**revise_request)
        revised = parse_response(revise_resp.content, passages)

        # Measured on real runs: the draft having citations is no guarantee
        # revise's own rewrite keeps them — rephrasing during the sharpness
        # pass is exactly what can shift wording away from a retrieved span's
        # exact text. When that happens, the draft already proved the content
        # is citable, so retrying revise alone (same draft, same instructions)
        # recovers it for one call — far cheaper than the outer safety net
        # below re-running the whole draft+revise pass from scratch, which is
        # the right escalation only when the draft itself lacked citations.
        if not revised["citations"] and draft_parsed["citations"]:
            _emit("verifying", "The revised draft lost its citation links — reattaching them")
            retry_revise_resp = client.messages.create(**revise_request)
            retry_revised = parse_response(retry_revise_resp.content, passages)
            if retry_revised["citations"]:
                revised = retry_revised

        return revised

    parsed = _one_pass()
    # Native citations depend on the model's own phrasing landing close
    # enough to a retrieved span for the API to match it — stochastic, and
    # rare but real: a whole response can come back with zero matched
    # citations despite genuinely source-grounded content, which silently
    # reads as a solid report unless you check. That defeats the tool's core
    # premise (every claim traces to a source), so one retry on an empty
    # citation list is worth the extra call; if it recurs, surface what we
    # have rather than loop indefinitely.
    if not parsed["citations"] and passages:
        retry = _one_pass()
        if retry["citations"]:
            parsed = retry
    # Deterministic canon check (see _canon_issues): mislabeled instrument
    # rows or missing canon acts get one targeted correction call — the check
    # finds, the model fixes. Anything still unresolved is surfaced as
    # canon_notes instead of silently shipped.
    issues = _canon_issues(parsed["briefing"], passages)
    if issues:
        _emit("cross-checking", "Cross-checking the regulatory register for consistency")
        draft = _MARKER_RE.sub("", parsed["briefing"])
        fixed_resp = client.messages.create(**build_fix_request(passages, draft, issues))
        fixed = parse_response(fixed_resp.content, passages)
        if fixed["citations"]:
            remaining = _canon_issues(fixed["briefing"], passages)
            if len(remaining) < len(issues):
                parsed, issues = fixed, remaining
    parsed["briefing"] = _sort_compliance_table(parsed["briefing"])
    return {"query": query, "passages": passages, "canon_notes": issues, **parsed}
