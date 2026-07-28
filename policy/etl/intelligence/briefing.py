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

import datetime as dt
import re
from collections import Counter
from collections.abc import Callable
from typing import Any

import structlog
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from data.config import get_settings
from data.models import Actor, ActorRole, DocumentActor, Enrichment
from etl.adapters.eurlex_key_acts import KEY_ACTS
from etl.enrichment import (
    Embedder,
    Reranker,
    canon_passages,
    document_passages,
    get_reranker,
    press_passages,
    rerank_passages,
    semantic_search,
)

from .profile import CompanyProfile

log = structlog.get_logger(__name__)

# The foundational-act canon (GDPR, DMA, DSA, AI Act, CRA, NIS2...) — every
# brief gets one guaranteed passage per act so the Compliance exposure table
# can render an explicit, grounded verdict for each, not just whichever acts
# happen to win open semantic search against the company's own language.
_CANON_CELEX = list(KEY_ACTS)

# --- Retrieval shape ------------------------------------------------------
# These four constants together decide whether a brief can be specific.
#
# The failure they exist to prevent, measured live 2026-07-27 on a fintech/AI
# profile: 66 passages retrieved across 65 distinct documents — one window of
# each of 65 laws, 82k chars of context, and no instrument represented deeply
# enough to say anything concrete about. 55 of those 66 were the canon sweep,
# i.e. 83% of context was spent on breadth nobody chose. A brief built on that
# can name instruments and little else, which is exactly the "surface level"
# complaint. The fix is a budget split explicitly between breadth and depth
# instead of one that only ever bought breadth.

# Per-facet breadth pass: how many passages each facet query contributes, and
# how many documents any one facet may speak through. Small on purpose —
# breadth's job here is only to nominate the instruments worth deepening.
_FACET_K = 5
_FACET_MAX_PER_DOC = 2
# _FACET_MAX_PER_DOC bounds one facet's contribution, but nothing bounds the
# union: a document matching every facet can reach facets x _FACET_MAX_PER_DOC
# passages before the depth pass runs at all. Untriggered on the profiles
# measured so far (breadth's own worst case was 3), so this is a bound on a
# structural possibility rather than a fix for an observed regression — it
# keeps breadth in its lane (nominating instruments) and leaves deliberately
# accumulating passages to the depth pass, which does it only for documents
# that earned a slot.
_BREADTH_MAX_PER_DOC = 3

# Depth pass: the top instruments from breadth get re-retrieved within
# themselves (see document_passages). This is where the context budget freed
# by _CANON_STUB_CHARS goes.
_DEEPEN_DOCUMENTS = 10
_DEEPEN_PER_DOCUMENT = 4

# Cosine floor on the legal path. press_passages has had a floor since it was
# written; semantic_search's brief-path callers never passed one, so a brief
# always got k passages whether or not anything relevant existed. 0.40 sits
# below the observed live median (0.53) and just under the observed weakest
# match (0.345) — it removes clear noise without pretending to know where
# "relevant" starts. Tighten it against real output, not intuition.
_LEGAL_MIN_SCORE = 0.40

# Per-facet overrides of (min_score, k). A facet whose corpus is large and whose
# usefulness is conditional needs a higher bar than the general legal path.
#
# `enforcement` is exactly that. Case law went from 197 to 1,440 documents in one
# backfill, and unlike a regulation — which either applies to a company or does
# not — a ruling is only worth context if it bears on a provision the brief is
# actually giving a verdict on. A judgment about telecoms interconnection fees is
# a perfectly good semantic match for "Court of Justice ruling on obligations"
# and completely useless in a fintech brief. At the general 0.40 floor the facet
# would reliably find *something* for every profile, which is the failure mode:
# case law that is present but not pertinent, competing for the depth budget
# against binding text the company genuinely is subject to.
#
# 0.55 is deliberately above the observed corpus median (~0.53): the facet
# should return nothing at all for a profile with no relevant precedent rather
# than return its best weak match. k=3 caps the ceiling for the same reason.
# Controlling this at nomination also controls the depth pass, since only
# nominated documents get deepened.
_FACET_OVERRIDES: dict[str, dict[str, float | int]] = {
    "enforcement": {"min_score": 0.55, "k": 3},
}

# The over-fetch pool handed to the reranker per facet. A cross-encoder can
# only promote what the bi-encoder already retrieved, so the pool has to be
# wider than the facet's own k for reranking to change anything at all.
_RERANK_POOL = 40

# A canon passage's job is to let the Compliance table state a grounded
# verdict — including "Out of Scope" — for every foundational act. That needs
# the act identified and its subject matter visible; it does not need a full
# ~1,500-char window, which is what made the canon sweep consume most of the
# context budget. Trimming to a leading excerpt keeps the guarantee (the act
# is still in context, still citable, still seen by _canon_issues) at roughly
# a quarter of the cost. Acts that breadth or depth retrieved on their own
# merit are never stubbed — they keep their full passages.
_CANON_STUB_CHARS = 350

# Curated allowlist for press_passages() — document_type doesn't reliably
# separate press/political-narrative sources from other "other"-typed feeds
# (e.g. heise_news and golem_news are typed OTHER, not PRESS; legislative-
# tracking feeds and verbatim debates are also OTHER). Feeds the Political
# landscape section only; SYSTEM_PROMPT already tells the model never to
# treat these as a substitute for binding legal text. Adjust this list based
# on real output quality — it's a judgment call about what counts as
# political-narrative-relevant, not a fixed classification.
_PRESS_SOURCE_KEYS = {
    # General tech-policy journalism
    "netzpolitik", "sifted", "next_ink", "heise_news",
    "golem_news", "irights_info", "01net", "numerama", "lemonde_pixels",
    "siecledigital", "contexte_articles", "latribune", "euobserver",
    "verfassungsblog",
    # "gnews_eu_tech"/"gnews_de_tech"/"gnews_fr_tech" removed 2026-07-23 —
    # these Google News keyword feeds were a workaround for outlets that
    # were bot-blocked/paywalled at the time (Euractiv, Politico, MLex);
    # curated Politico + EU DG newsletter access now covers much of that
    # ground with real institutional voice instead of SEO-explainer
    # framing. Found live: gnews_eu_tech's dozens of near-identical "what
    # is the AI Act" explainer articles swept every press slot for any
    # AI-flavored company profile on raw similarity, crowding out
    # genuinely current newsletter content that ranked only slightly
    # lower — see press_passages()'s MMR reranking for the general-purpose
    # fix, this removal is the surgical one for the specific known cause.
    # Still registered as FeedSpec entries in feeds.py and still
    # ingested — just no longer fed into brief generation.
    "eu_law_live", "eu_law_analysis", "stiftung_datenschutz",
    # "techcrunch_eu" excluded 2026-07-21 — verified live: the feed's own
    # <lastBuildDate> is frozen at 17 Feb 2026 (an external, server-side
    # staleness, not our adapter). Registered in feeds.py but dormant; if
    # TechCrunch's feed ever recovers, re-add here — no other code change
    # needed since discover()'s since-filter already handles it correctly.
    # Official institutional/stakeholder press releases — kept in scope
    # since they directly serve "which stakeholders are at play"
    "ec_press", "ec_digital", "ecb_press", "edpb_news", "cnil_news",
    "bsi_presse", "bitkom_presse", "arcep_presse", "amf_presse",
    "bmwe_presse", "bfdi_news", "anssi_news", "eba_news", "berec_news",
    "eiopa_news", "eu_ombudsman", "ep_press", "bundestag_hib",
    "bundesrat_neueingaenge", "hmbbfdi_news", "defenseurdesdroits_actu",
    "laquadrature", "ep_written_questions",
    # Parliamentary floor-debate transcripts — a named politician's own
    # stated position, not a journalist's account of it; SYSTEM_PROMPT
    # already routes "verbatim_debate"-kind passages to the Political
    # landscape section as primary-source political signal, same as press
    "ep_verbatim", "an_verbatim", "de_verbatim",
    # Added 2026-07-22 — political-currency/stakeholder-specificity sources
    # (named individuals, live contested fights, active enforcement), see
    # decision-log.md for the feasibility research behind this batch
    "techpolicy_press", "dg_comp_news", "dg_grow_news", "politico_eu",
    "lemonde_politique", "lemonde_europe", "handelsblatt_politik",
    # Full-issue newsletter archives (custom adapters, not FeedSpec RSS) —
    # same real-time signal as the RSS feeds above plus multi-year backfill
    "politico_brussels_playbook", "politico_digital_bridge",
    "politico_berlin_playbook", "politico_playbook_paris",
    "politico_london_playbook", "politico_sunday_crunch",
    "politico_eu_influence", "politico_london_influence", "politico_forecast",
    "ec_newsroom_dae", "ec_newsroom_comp", "ec_newsroom_growth",
    "ec_newsroom_trade", "ec_newsroom_just",
}
_PRESS_RECENCY_DAYS = 90
# A weak press match becomes weak, generic-sounding narrative color in the
# brief (not just a slightly-off citation, as a weak legal-text match would
# be) — worth a floor here even without the calibration data to justify one
# for the main legal-text retrieval. 0.3 is a starting point, not an
# empirically-derived cutoff — real press scores observed so far run
# ~0.7-0.76 for genuinely on-topic matches; revisit once more runs exist.
_PRESS_MIN_SCORE = 0.3

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
    "DIRECTIVE TRANSPOSITION is a separate question from predecessor/successor timing "
    "above, and just as easy to get wrong: an EU Directive (unlike a Regulation) is not "
    "self-executing — it binds through each Member State's own national implementing "
    "act, and transposition timing and substance both vary by Member State, often years "
    "past the nominal deadline. When the retrieved source for a Directive-type "
    "instrument (e.g. NIS2) is the Directive's own EU-level text with no retrieved "
    "national transposition act, verdict against the Directive's own text — its "
    "substantive obligations are the reliable signal of where national law is heading "
    "even before or during transposition — but name the transposition gap explicitly in "
    "Why/Trigger ('binds via national transposition; confirm the implementing act in "
    "the company's Member State') rather than treating the EU text as if it were "
    "itself the directly binding national rule.\n\n"
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
    "'may', 'possibly', 'TBD', 'not defined', or hedge in prose about YOUR OWN verdict "
    "or analysis. This does not ban accurately reporting a source's own discretionary "
    "language about itself — 'the authority may impose a fine of up to 4% of global "
    "turnover' is a fact about the regime's structure, not an analyst hedge, and must "
    "be reported as the regulation actually states it; only your own uncertainty about "
    "the verdict is banned, never a source's genuine legal discretion. If the evidence "
    "is thin, commit to the most likely call and make 'confirm the underlying text' an "
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
    "Once a verdict is committed for an instrument in the Compliance table, that "
    "verdict is final everywhere else in the brief. No other paragraph — the "
    "Political landscape & strategic play section especially, since it discusses "
    "classification-heavy files at length — may describe the same classification, "
    "threshold, or activity question that verdict turned on as still 'open', "
    "'unresolved', 'unclear', 'to be determined', or otherwise unsettled. A "
    "committed verdict and a stray hedge about the same underlying fact cannot "
    "both stand: if the fact was settled enough to commit In Scope or Out of "
    "Scope, it is settled everywhere in the brief, not just in the table cell; if "
    "it genuinely is not settled, the table verdict itself must be Monitor with "
    "the hinge named — never park the hedge in a later section while the table "
    "quietly asserts a flat verdict it hasn't earned.\n\n"
    "Length: 700-1000 words total, excluding tables and bullet lists, for a typical "
    "mid-complexity company. This is a target shaped by keeping a genuinely wide scope "
    "sweep — every canon instrument checked — from reading as a wall of tables, not a "
    "floor to pad toward: a company with a genuinely thin footprint (2-3 applicable "
    "instruments, no live competitor angle) should run shorter, honestly, rather than "
    "padding sentences that add no fact to hit the range; a genuinely wide-scope company "
    "(e.g. a fintech touching MiCA, DORA, GDPR, NIS2 and eIDAS2 at once) may run longer "
    "rather than cutting real, cited facts to stay under it. Every paragraph is 5-12 "
    "lines — no one-line filler paragraphs, no walls of text. Target the whole brief, "
    "main body plus appendix, at roughly 2-2.5 printed pages for that typical case: the "
    "word budget plus the two-table split below (a short main table, a one-line-per-row "
    "appendix) is what keeps the sweep from reading as a wall of tables.\n\n"
    "Structure, exactly these sections, in Markdown:\n"
    "# Regulatory Intelligence Brief: <company name>\n"
    "A single bold sentence immediately under the title — the headline verdict: what "
    "applies, what doesn't, what's coming. The one line a rushed executive reads if "
    "nothing else.\n"
    "## Bottom line — bullets, one line each, no sub-bullets, no lead-in clauses. "
    "Written for a founder/investor skimming on a phone, not reading prose. Two "
    "bullet types, always in this order:\n"
    "ACTION bullets first — exactly one bullet per Prio 1 row in the Compliance "
    "exposure table below, and nothing else: state that row's verdict, why it's Prio "
    "1, and — when the retrieved sources support one — the single concrete owned "
    "action it requires (a specific compliance step, registration, filing, or "
    "deadline), not just a re-derivation of the table cell. A verdict-and-reason alone "
    "is a diagnosis with no next step; many readers of this brief have no in-house "
    "compliance function to translate a diagnosis into an action themselves, so naming "
    "one is not optional polish — only fall back to verdict-and-reason alone when no "
    "concrete action is genuinely supportable from the sources, never invent one to "
    "fill the slot. This is one action tied to one row, not the 'Next actions' "
    "sequencing plan banned below — naming what THIS row requires is not the same as "
    "sequencing a roadmap across all of them. Never include a Prio 2 or Prio 3 "
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
    "table stays a short, scannable priority list, not a scope map. One exception, and "
    "only this one: an instrument the company is itself genuinely Out of Scope for "
    "(its own status is a settled fact, e.g. definitively not a gatekeeper) can still "
    "get a Monitor row here if a NAMED third party's compliance dynamic under that same "
    "instrument is strategically relevant per Prio 1(b) below — that row tracks the "
    "third party's dynamic, not the company's own scope, and its Why/Trigger cell must "
    "say so explicitly ('not a gatekeeper itself; tracking Google's Art. 6(5) "
    "compliance for the distribution opening it creates'). The company's own settled "
    "Out-of-Scope status for that same instrument still also gets its normal Appendix "
    "row — the two rows answer two different questions about the same instrument, not "
    "a contradiction.\n"
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
    "PRIO/VERDICT CONSISTENCY. Prio and Verdict answer different questions and are "
    "deliberately independent — a file can be verdict-**Monitor** yet Prio 1, as in "
    "(b) above where a rival's compliance dynamic is the opportunity. But ONE "
    "combination cannot occur: a **Monitor** row whose hinge is still unresolved (you "
    "wrote 'if', 'unconfirmed', or named a threshold fact the profile does not answer) "
    "must NOT be Prio 1. Prio 1 means resource it now, and you cannot ask a reader to "
    "resource work whose applicability you have just said is unknown — that is how a "
    "brief tells someone to spend money on a maybe. Such a row is Prio 2 with the "
    "unresolved fact named as what would promote it, and if resolving that fact is "
    "genuinely urgent, the ACTION bullet is 'establish whether X', not the compliance "
    "work itself. A Prio 1 Monitor row is only correct when the trigger is CONFIRMED "
    "and sits outside this company (criterion (b) or (c)).\n"
    "Order rows by Prio ascending (all 1s first); within the same Prio, In Scope "
    "before Monitor. Always bold the Verdict cell's value itself ('**In Scope**', "
    "'**Monitor**') — not just in the rule text above, in every row you write. If "
    "genuinely no instrument clears In Scope or Monitor (a pre-launch or extremely "
    "thin-footprint company), do not render an empty table with just headers — replace "
    "this whole subsection with one line stating that plainly ('No instrument reaches "
    "In Scope or Monitor at this company's current footprint — see the Out of Scope "
    "register below for the full scoping record'); the Appendix still does its normal "
    "exhaustive job regardless. Otherwise, follow the table with one paragraph (5-12 "
    "lines) of expert institutional context on the single most material instrument — "
    "its enforcement history, timeline realism, why the deadline is or isn't real.\n"
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
    "NAMED STAKEHOLDERS BLOCK. When a block headed 'NAMED STAKEHOLDERS' appears after "
    "the source documents, it is this corpus's own record of who spoke on or holds the "
    "retrieved files, with institution, political group and role. USE IT — it exists "
    "because briefs kept naming only institutions ('the AI Office', 'the responsible "
    "committee') where a reader needs a person. Anyone listed as rapporteur holds that "
    "file and should be named as such. Prefer these names over a role description "
    "whenever one covers the file you are discussing. Two hard limits: (1) never name a "
    "person from that block on a file they are not listed against — the block records "
    "who engaged with WHICH documents, and moving a name onto a different instrument is "
    "a fabrication of exactly the kind the INSTRUMENT IDENTITY rule forbids; (2) do not "
    "list stakeholders who add nothing — someone who spoke once in a debate is not "
    "automatically a lever, and a paragraph of names with no stated relevance is "
    "padding. Three well-chosen named people beat eight listed ones. If no such block "
    "appears, fall back to naming roles and bodies exactly as above.\n"
    "The "
    "same hedge applies to a track-record or enforcement-posture claim, not just a "
    "name: 'known for aggressive enforcement' or 'has signaled a lighter touch' goes "
    "stale the same way an officeholder's name does — ground it in a specific past "
    "action or statement from the retrieved sources or well-established public "
    "knowledge rather than asserting a general reputation as a settled, unchanging "
    "fact.\n"
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
    "binding source for the verdict — do not silently pick one. The same discipline "
    "applies when two sources of the SAME type conflict — two Press articles giving "
    "different enforcement figures, or a pre- and post-amendment version of the same "
    "legal text: prefer whichever source is more recent by its own stated or evident "
    "date, and say so explicitly rather than silently picking one or blending both as "
    "if they agreed.\n\n"
    "ENFORCEMENT PRECEDENT. '[EU · Judgment]' sources are Court of Justice or General "
    "Court rulings, and '[.. · Enforcement decision]' sources are supervisory-authority "
    "decisions and fines. These outrank every other source on the one question they "
    "answer: what a provision actually REQUIRES in practice. A regulation's text states "
    "the duty; a ruling states how that duty has been read when someone contested it, "
    "which is what a verdict in your table is really predicting.\n"
    "The bar for using one is HIGH, and deliberately so. Cite a judgment only when it "
    "construes a provision of an instrument you have already given a verdict on, AND "
    "that construction changes what this company must do or how exposed it is. A ruling "
    "that is merely on a related topic, in the same policy area, or about the same "
    "instrument on a point that does not touch this company's activity is NOT relevant "
    "— leave it out entirely. Most briefs should cite no case law at all; a brief that "
    "reaches for a tangential ruling to look rigorous is worse than one that cites "
    "none, because it spends the reader's attention on a holding that does not move "
    "their decision. When you do use one, name what the court held and which provision "
    "it turned on, in that instrument's Why/Trigger cell or in the prose.\n"
    "Where a judgment and a Communication or Staff working document both construe the "
    "same provision, the judgment governs and the commentary is at most context. Never "
    "manufacture this: the INSTRUMENT IDENTITY rule above applies to cases exactly as "
    "it does to legislation, so never name a case that is not among your sources, and a "
    "misattributed holding is worse than no holding."
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
    order defines the ``document_index`` Claude cites back.

    A passage carrying ``summary`` (from the ``enrichments`` table, attached by
    ``_attach_summaries``) gets a one-line whole-instrument header above its own
    text. Retrieval hands the model a ~1,500-char window of an act; that window
    is enough to quote a provision and not enough to know what the instrument
    *is*, which is how a brief ends up quoting Article 12 of something it can't
    characterise. The header closes that gap for a few hundred characters.

    Deliberately emitted only on a document's FIRST block: the depth pass puts
    4-6 passages of the same act in context, and repeating one summary five
    times would spend the context this is meant to use well.
    """
    docs = []
    summarised: set[str] = set()
    for p in passages:
        label = p.get("celex") or p.get("title") or "source"
        prefix = _source_label(p.get("jurisdiction"), p.get("document_type"), p.get("kind"))
        title = f"{prefix} {label}" if prefix else str(label)
        body = p["text"]
        summary = p.get("summary")
        doc_key = _doc_key(p)
        if summary and doc_key not in summarised:
            summarised.add(doc_key)
            body = f"[What this instrument does: {summary}]\n\n{body}"
        docs.append(
            {
                "type": "document",
                "title": title,
                "source": {"type": "text", "media_type": "text/plain", "data": body},
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


def build_request(
    profile: CompanyProfile, passages: list[dict], stakeholder_block: str | None = None
) -> dict[str, Any]:
    """Assemble the full messages.create(**kwargs) payload (no API call).

    ``stakeholder_block`` (see build_stakeholder_block) is appended as plain text
    after the Citations documents, not as a document block: it is a roster
    assembled from the corpus, not a quotable source span, and giving it a
    document block would invite citation markers pointing at something that has
    no char offsets to cite.
    """
    settings = get_settings()
    scoping = "\n".join(f"- {line}" for line in profile.scoping_lines())
    instruction = (
        # Without this, TRANSITIONAL APPLICABILITY's whole "has the
        # successor's application date arrived yet" check has no anchor —
        # the model's only fallback would be its training cutoff, which is
        # always wrong (always too early) for every brief generated after
        # that cutoff. Found live 2026-07-21: never injected anywhere.
        f"Today's date is {dt.date.today().isoformat()}.\n"
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
    content = build_documents(passages)
    if stakeholder_block:
        content = content + [{"type": "text", "text": stakeholder_block}]
    content = content + [{"type": "text", "text": instruction}]
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
    "your instructions requires for numeric thresholds. (9) VERDICT CONSISTENCY "
    "CHECK — for every instrument with a committed verdict in the Compliance "
    "table, check whether any OTHER paragraph in the brief — prose in Political "
    "landscape & strategic play especially — contradicts that verdict by "
    "treating the same classification, threshold, or activity question as still "
    "open. The default fix, and the one that applies almost every time this "
    "happens, is to edit the contradicting prose so it matches the table verdict "
    "— the fact was already established or you couldn't have committed the "
    "verdict in the first place. Only fall back to downgrading the table verdict "
    "to Monitor with the hinge named if re-reading shows the hinge genuinely was "
    "never established anywhere in the brief; do not use a Monitor downgrade as "
    "a shortcut to avoid reconciling prose you can otherwise just fix. "
    "(10) PRIO/VERDICT CHECK — find every Prio 1 row whose Verdict is "
    "**Monitor**, and for each ask whether its trigger is CONFIRMED or still "
    "hinges on a fact the profile does not answer. If the hinge is unresolved, "
    "demote it to Prio 2 and name the unresolved fact as what would promote it; "
    "if an ACTION bullet was written for that row, rewrite the bullet as "
    "establishing the fact rather than doing the compliance work. Prio 1 tells "
    "the reader to spend now, so it cannot rest on a maybe — a confirmed "
    "external trigger (a rival's enforcement dynamic, a looming tax change) is "
    "the only case where Prio 1 Monitor is right. Do not "
    "change facts, citations, or verdicts for instruments you keep unchanged, "
    "and do not restructure sections — but table rows ARE subject to checks "
    "(7), (8), (9) and (10): remove any row naming an unretrieved instrument, add a "
    "row for any retrieved foundational instrument your draft skipped entirely, "
    "correct any flat verdict standing on an unestablished hinge, and edit "
    "contradicting prose outside the tables to match a committed verdict — none "
    "of this counts as restructuring a section. This is a "
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


def _cap_per_source(passages: list[dict], *, max_per_source: int = 2) -> list[dict]:
    """Keep at most ``max_per_source`` passages per Source.key, preserving
    order — a backstop alongside press_passages()'s own MMR reranking, not
    a replacement for it: MMR already discourages near-duplicate content
    from monopolizing the result, but nothing guarantees it in the way a
    hard cap does, and this is cheap insurance against whatever source
    someday accumulates the same kind of volume glut gnews_eu_tech did
    (removed 2026-07-23, see _PRESS_SOURCE_KEYS) — a new Google News query
    feed, an unusually productive RSS source, anything. Passages with no
    ``source_key`` (semantic_search/canon_passages results, which don't set
    it) pass through uncapped."""
    counts: dict[str, int] = {}
    kept = []
    for p in passages:
        key = p.get("source_key")
        if key is None:
            kept.append(p)
            continue
        counts[key] = counts.get(key, 0) + 1
        if counts[key] <= max_per_source:
            kept.append(p)
    return kept


def _select_breadth_first(passages: list[dict], k: int) -> list[dict]:
    """Select up to k passages, round-robin across documents rather than a
    flat best-score truncation.

    _cap_per_document already bounds how many passages any one document can
    contribute — but a plain ``[:k]`` slice applied afterward can still
    re-concentrate on whichever 2-3 documents happen to rank highest on raw
    similarity: capping controls crowding within the pre-slice set, but
    doesn't survive a subsequent truncation by score alone. This restores
    what _cap_per_document's own docstring already claims — breadth up to
    k distinct documents, not just up to the cap."""
    groups: dict[str, list[dict]] = {}
    order: list[str] = []
    for p in passages:
        key = str(p.get("celex") or p.get("url") or p.get("title"))
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(p)
    # Groups are already internally best-first (input is best-first); order
    # the groups themselves by their own best passage's score, descending.
    order.sort(key=lambda key: groups[key][0].get("score", 0.0), reverse=True)
    selected: list[dict] = []
    round_idx = 0
    while len(selected) < k:
        added_this_round = False
        for key in order:
            if round_idx < len(groups[key]):
                selected.append(groups[key][round_idx])
                added_this_round = True
                if len(selected) >= k:
                    break
        if not added_this_round:
            break
        round_idx += 1
    return selected


# Precedent document types, and the hardest ceiling on how much of a brief's
# context they may occupy.
#
# Neither the facet floor nor the depth quota can guarantee this, which is why it
# exists. Raising the `enforcement` facet's floor to 0.55 and giving precedent its
# own small depth share both helped and neither bound: measured 2026-07-27, a
# fintech profile still reached 21 judgment passages (32% of substantive context)
# because the *other* facets surface rulings too — "personal data processing
# obligations" is a genuinely good match for a data-protection judgment, at any
# floor. Case law arriving through five different doors cannot be limited at any
# one of them, so the cap is applied once, globally, to the assembled set.
_PRECEDENT_TYPES = frozenset({"judgment", "enforcement_decision"})
_MAX_PRECEDENT_PASSAGES = 6


def _cap_precedent(passages: list[dict], *, limit: int = _MAX_PRECEDENT_PASSAGES) -> list[dict]:
    """Keep at most ``limit`` precedent passages, the best-scoring ones, and all
    non-precedent passages untouched.

    A ruling earns context by construing a provision the brief is already ruling
    on — so a handful of strong ones is the whole value, and the eleventh adds
    reading cost rather than insight. Preserves input order so the caller's own
    ordering (and the citation indices built from it) is unaffected.
    """
    ranked = sorted(
        (p for p in passages if p.get("document_type") in _PRECEDENT_TYPES),
        key=lambda p: p.get("rerank_score", p.get("score", 0.0)) or 0.0,
        reverse=True,
    )
    keep = {id(p) for p in ranked[:limit]}
    return [
        p for p in passages if p.get("document_type") not in _PRECEDENT_TYPES or id(p) in keep
    ]


def _doc_key(passage: dict) -> str:
    """The grouping key every per-document cap here already used, extracted so
    the depth pass groups passages exactly the way the caps do."""
    return str(passage.get("celex") or passage.get("url") or passage.get("title"))


# How the depth budget is split across kinds of document, as fractions of
# _DEEPEN_DOCUMENTS. Relevance alone picks the wrong documents to go deep on,
# and the measurement is unambiguous — first run of the depth pass
# (2026-07-27, fintech/AI profile) spent 37 of 64 substantive passages on
# Commission staff working documents, impact assessments and communications,
# and gave the AI Act and the GDPR exactly one passage each.
#
# That is not a ranking bug: an impact assessment about AI in consumer credit
# genuinely is topically closer to a company profile than the AI Act's own
# terse operative articles are, and both the embedder and the cross-encoder
# are right to say so. It is a mismatch between what "relevant" means to a
# retriever and what a compliance brief needs, and no amount of reranking
# fixes it, because the commentary really is more query-similar prose. The
# instrument that binds the company has to be prioritized over documents
# discussing it, so the split is stated explicitly instead of being an
# accident of what the corpus happens to contain.
#
# Commentary keeps a share rather than being excluded: impact assessments are
# where the Commission's own reasoning and quantified thresholds live, which
# is real brief material — it just cannot be most of the budget. Proposals
# get their own share because "what's changing" is half the product promise.
# Tiers use data/models.py's DocumentType values. Judgments sit in the binding
# tier: a ruling on what a provision requires is as decisive for a compliance
# verdict as the provision's own text, and often more so. Standards sit there
# too — they confer presumption of conformity, which is the practical test a
# manufacturer is actually measured against. Budget instruments are binding but
# deliberately excluded: discharge decisions would compete for depth slots
# against regulation the company is genuinely subject to.
_DEEPEN_QUOTAS: tuple[tuple[str, frozenset[str], float], ...] = (
    (
        "binding",
        frozenset({"regulation", "directive", "decision", "standard"}),
        0.55,
    ),
    # Case law gets its own small share rather than sitting in the binding tier.
    # Judgments were originally put in `binding` on the reasoning that a ruling
    # on what a provision requires is as decisive as the provision's text — true,
    # but it conflates authority with relevance. A regulation either applies to a
    # company or does not; a ruling only matters if it construes a provision the
    # brief is already giving a verdict on. Sharing the binding quota let the
    # depth pass amplify 5 nominated rulings into 20 passages — 31% of a
    # fintech profile's substantive context, measured 2026-07-27. A small
    # dedicated share keeps precedent available where it is genuinely on point
    # (a no-AI, no-personal-data logistics profile correctly retrieves none)
    # without letting it crowd out the binding text the company is subject to.
    ("precedent", frozenset({"judgment", "enforcement_decision"}), 0.1),
    ("pipeline", frozenset({"proposal", "consultation", "opinion"}), 0.2),
    (
        "commentary",
        frozenset(
            {
                "communication",
                "guideline",
                "staff_working_doc",
                "press",
                "newsletter",
                "verbatim_debate",
                "budget",
                "other",
            }
        ),
        0.2,
    ),
)


def _top_document_ids(passages: list[dict], *, limit: int) -> list[int]:
    """The ``limit`` documents worth deepening, quota-split by authority (see
    _DEEPEN_QUOTAS) and ranked within each tier by that document's own best
    passage.

    Ranks documents, not passages: a document represented by one strong
    passage should outrank one represented by three mediocre ones, since the
    question being answered is "which instruments matter to this company",
    not "where is the densest cluster of text". A tier that can't fill its
    quota spills its unused slots to the best remaining candidates of any
    tier, so a thin corpus for one tier costs nothing rather than shrinking
    the depth pass."""
    best: dict[int, tuple[float, str]] = {}
    for p in passages:
        doc_id = p.get("document_id")
        if doc_id is None:
            continue
        score = p.get("rerank_score", p.get("score", 0.0)) or 0.0
        dtype = (p.get("document_type") or "other").lower()
        if doc_id not in best or score > best[doc_id][0]:
            best[doc_id] = (score, dtype)

    tiers: dict[str, list[tuple[float, int]]] = {name: [] for name, _, _ in _DEEPEN_QUOTAS}
    for doc_id, (score, dtype) in best.items():
        tier = next((name for name, types, _ in _DEEPEN_QUOTAS if dtype in types), "commentary")
        tiers[tier].append((score, doc_id))
    for candidates in tiers.values():
        candidates.sort(reverse=True)

    selected: list[int] = []
    for name, _, share in _DEEPEN_QUOTAS:
        quota = max(1, round(limit * share))
        selected.extend(doc_id for _, doc_id in tiers[name][:quota])
    # Spill: fill any slots the quotas left unused with the best remaining
    # candidates regardless of tier, best-scoring first.
    if len(selected) < limit:
        taken = set(selected)
        spare = sorted(
            (entry for candidates in tiers.values() for entry in candidates), reverse=True
        )
        for _, doc_id in spare:
            if len(selected) >= limit:
                break
            if doc_id not in taken:
                selected.append(doc_id)
                taken.add(doc_id)
    return selected[:limit]


def _stub_canon_passages(canon: list[dict], substantive: list[dict]) -> list[dict]:
    """Trim canon passages to a short excerpt, dropping any whose instrument is
    already substantively in context.

    Two distinct jobs were being paid for with the same expensive unit. An act
    the company is genuinely exposed to needs its operative provisions quoted
    at length; an act it merely needs to be told it is OUT of scope of needs
    only to be identified and grounded. Charging both the same ~1,500 chars is
    what let 55 canon acts crowd out the depth the exposed ones needed.

    An act that breadth/depth retrieved on merit is skipped entirely here: it
    is already in context with full text, so re-adding a stub of it would
    duplicate the instrument without adding anything, while still counting
    against the budget. _canon_issues reads the CELEX off whichever passage
    carries it, so the table-completeness guarantee is unaffected either way.
    """
    present = {p.get("celex") for p in substantive if p.get("celex")}
    stubs: list[dict] = []
    for p in canon:
        if p.get("celex") in present:
            continue
        stubs.append({**p, "text": _excerpt(p["text"], _CANON_STUB_CHARS), "canon_stub": True})
    return stubs


def _excerpt(text: str, limit: int) -> str:
    """Leading ``limit`` chars, cut back to the last sentence boundary so the
    excerpt ends as a sentence rather than mid-clause. Citations quote spans of
    what we send, so a stub truncated mid-word invites a mangled quote."""
    if len(text) <= limit:
        return text
    head = text[:limit]
    cut = max(head.rfind(". "), head.rfind(".\n"), head.rfind("; "))
    # Only honor the boundary if it isn't so early that we'd throw away most
    # of the excerpt (common in legal text, where the first "." is an article
    # number like "Article 5." a handful of chars in).
    return head[: cut + 1] if cut >= limit // 2 else head.rstrip() + "…"


def _attach_summaries(session: Session, passages: list[dict]) -> list[dict]:
    """Attach each passage's document-level ``summary`` from the ``enrichments``
    table, where one exists.

    One query for the whole passage set, keyed on ``document_id``. Passages whose
    document has no enrichment are returned untouched, so this is a no-op on a
    corpus where the enrichment pass hasn't run — the brief degrades to exactly
    its previous behaviour rather than failing.
    """
    doc_ids = {p["document_id"] for p in passages if p.get("document_id") is not None}
    if not doc_ids:
        return passages
    rows = session.execute(
        select(Enrichment.document_id, Enrichment.summary).where(
            Enrichment.document_id.in_(doc_ids), Enrichment.summary.is_not(None)
        )
    ).all()
    by_doc = {doc_id: summary for doc_id, summary in rows}
    if not by_doc:
        return passages
    return [
        {**p, "summary": by_doc[p["document_id"]]}
        if p.get("document_id") in by_doc
        else p
        for p in passages
    ]


# How many named stakeholders reach the brief. Small on purpose: the failure this
# fixes is "no names at all", and the opposite failure — a wall of 40 MEPs who
# each spoke once — would be just as unusable and would spend context that binding
# text needs. Ranked by how much they engaged with the instruments already in
# scope, so the cut keeps the people most involved with this company's files.
_MAX_STAKEHOLDERS = 8


def _stakeholders(session: Session, passages: list[dict]) -> list[dict]:
    """Named actors linked to the documents already in context.

    Resolved from the passage set rather than retrieved independently: the
    question a brief needs answered is "who runs the files I am already
    discussing", and a separate retrieval pass would drag in people attached to
    instruments the company has nothing to do with.

    Actors are not passages and deliberately do not compete for passage slots —
    they are assembled into one short text block (see build_request), so adding
    them cannot displace binding law.
    """
    doc_ids = {p["document_id"] for p in passages if p.get("document_id") is not None}
    if not doc_ids:
        return []
    rows = session.execute(
        select(
            Actor.name,
            Actor.institution,
            Actor.political_group,
            DocumentActor.role,
            func.count(func.distinct(DocumentActor.document_id)).label("documents"),
        )
        .join(DocumentActor, DocumentActor.actor_id == Actor.id)
        .where(DocumentActor.document_id.in_(doc_ids))
        .group_by(Actor.name, Actor.institution, Actor.political_group, DocumentActor.role)
        # Rapporteurs first regardless of volume: holding the file is a stronger
        # claim to relevance than having spoken about it often.
        .order_by(
            case((DocumentActor.role == ActorRole.RAPPORTEUR, 0), else_=1),
            func.count(func.distinct(DocumentActor.document_id)).desc(),
        )
        .limit(_MAX_STAKEHOLDERS)
    ).all()
    return [
        {
            "name": name,
            "institution": institution,
            "political_group": group,
            "role": role.value if isinstance(role, ActorRole) else str(role),
            "documents": documents,
        }
        for name, institution, group, role, documents in rows
    ]


def build_stakeholder_block(stakeholders: list[dict]) -> str | None:
    """One compact text block naming the actors, or None when there are none.

    None matters: on a corpus with no actor data this returns nothing and the
    request is byte-identical to before, so the brief degrades to its previous
    behaviour rather than gaining an empty "Stakeholders:" heading that would
    invite the model to fill it from memory.
    """
    if not stakeholders:
        return None
    lines = [
        "NAMED STAKEHOLDERS on the instruments retrieved above, from this corpus's "
        "own record of who spoke on or holds these files:"
    ]
    for s in stakeholders:
        bits = [s["name"]]
        if s["institution"]:
            bits.append(s["institution"])
        if s["political_group"]:
            bits.append(s["political_group"])
        role = "rapporteur" if s["role"] == "rapporteur" else "spoke on the file"
        lines.append(f"- {' · '.join(bits)} — {role}, {s['documents']} document(s) in context")
    return "\n".join(lines)


def _retrieval_stats(passages: list[dict], facets: list[str]) -> dict[str, Any]:
    """Shape metrics for the passage set a brief was built on.

    This exists because the depth collapse above went unnoticed for as long as
    it did: nothing in the brief output or the logs said how many distinct
    documents context covered, or how much of it was canon filler versus
    passages something actually chose. ``documents_per_passage`` is the number
    to watch — as it approaches 1.0, every document is contributing exactly one
    passage and the brief cannot be anything but a list of names."""
    if not passages:
        return {"passages": 0, "documents": 0, "facets": facets}
    scores = [p["score"] for p in passages if p.get("score") is not None]
    reranked = [p["rerank_score"] for p in passages if p.get("rerank_score") is not None]
    stubs = sum(1 for p in passages if p.get("canon_stub"))
    docs = {_doc_key(p) for p in passages}
    ordered = sorted(scores)
    # Depth has to be measured over the substantive set only. Canon stubs are
    # ~50 single-passage documents included deliberately as a scope check, so
    # they drag the all-passage ratio toward 0.5 no matter how deep retrieval
    # actually is — which makes it useless as the collapse signal it was
    # introduced to be. Measured 2026-07-27: an all-passage ratio of 0.78 on a
    # profile whose substantive ratio was 0.54 with up to 5 passages per act.
    substantive = [p for p in passages if not p.get("canon_stub")]
    substantive_docs = {_doc_key(p) for p in substantive}
    return {
        "passages": len(passages),
        "documents": len(docs),
        # Kept for continuity, but read substantive_documents_per_passage.
        "documents_per_passage": round(len(docs) / len(passages), 3),
        # THE depth signal: 1.0 means every instrument the brief actually
        # reasons over contributed exactly one passage.
        "substantive_documents_per_passage": (
            round(len(substantive_docs) / len(substantive), 3) if substantive else None
        ),
        "max_passages_per_document": (
            max(Counter(_doc_key(p) for p in substantive).values()) if substantive else 0
        ),
        "canon_stubs": stubs,
        "substantive_passages": len(passages) - stubs,
        "context_chars": sum(len(p["text"]) for p in passages),
        "score_max": round(max(ordered), 3) if ordered else None,
        "score_median": round(ordered[len(ordered) // 2], 3) if ordered else None,
        "score_min": round(min(ordered), 3) if ordered else None,
        "reranked_passages": len(reranked),
        "facets": facets,
    }


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
    reranker: Reranker | None = None,
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
    progress UI built on this never claims a step that didn't occur.

    ``reranker`` defaults to the configured one (see get_reranker, which
    returns None when unavailable — reranking then degrades to embedding
    order). Pass one explicitly to pin behavior in tests.

    Retrieval shape metrics for the returned passage set are included as
    ``retrieval_stats`` — see _retrieval_stats for what to watch."""

    def _emit(stage: str, label: str) -> None:
        if on_stage is not None:
            on_stage(stage, label)

    _emit("retrieving", "Retrieving the sources that apply to your profile")
    query = profile.to_query()
    if reranker is None:
        reranker = get_reranker(get_settings())

    # --- Breadth: one small, sharply-queried pass per obligation facet ------
    # Each facet is retrieved separately and unioned rather than blended into
    # one query — see CompanyProfile.retrieval_queries() for why a single
    # concatenated profile string retrieves the centroid of a company instead
    # of any of its actual exposures. Per facet: over-fetch a rerank pool,
    # let the cross-encoder reorder it, then apply the existing per-document
    # cap and breadth-first selection to the reranked order.
    facets = profile.retrieval_queries()
    breadth: list[dict] = []
    for facet, facet_query in facets:
        override = _FACET_OVERRIDES.get(facet, {})
        min_score = float(override.get("min_score", _LEGAL_MIN_SCORE))
        facet_k = int(override.get("k", _FACET_K))
        pool = semantic_search(session, embedder, facet_query, k=_RERANK_POOL, min_score=min_score)
        # An overridden facet can legitimately return nothing — that is the
        # point of its higher floor, not a failure to route around.
        pool = rerank_passages(reranker, facet_query, pool, top_k=facet_k * 2)
        selected = _select_breadth_first(
            _cap_per_document(pool, max_per_doc=_FACET_MAX_PER_DOC), facet_k
        )
        breadth = _merge_passages(breadth, [{**p, "facet": facet} for p in selected])
    breadth = _cap_per_document(breadth, max_per_doc=_BREADTH_MAX_PER_DOC)
    # The competitive angle gets its own retrieval pass: blended into the main
    # query it reliably loses to the profile's compliance signal (an AI-using
    # company's query retrieves AI Act content, and a named rival's antitrust
    # exposure never makes the top-k). A dedicated query guarantees the
    # dynamic a seat in the passage set; the prompt guardrails still decide
    # whether it's worth writing about.
    competitive_query = _competitive_query(profile)
    if competitive_query:
        extra = semantic_search(session, embedder, competitive_query, k=max(4, k // 3))
        breadth = _merge_passages(breadth, extra)

    # --- Depth: re-retrieve inside the instruments breadth nominated -------
    # The whole point of the split. Breadth deliberately flattens to ~1-2
    # passages per document so it can survey; that same flattening is what
    # makes a brief generic. Here the top instruments get several of their own
    # operative provisions into context instead of one arbitrary window.
    _emit("retrieving", "Reading the instruments that apply to you in depth")
    deepen_ids = _top_document_ids(breadth, limit=_DEEPEN_DOCUMENTS)
    deep = document_passages(
        session, embedder, query, deepen_ids, k_per_doc=_DEEPEN_PER_DOCUMENT
    )
    passages = _merge_passages(breadth, deep)

    # Guarantee every foundational act a seat in context (see canon_passages'
    # docstring) — this is what lets the Compliance table state "CRA — Out of
    # Scope" with a real citation instead of silently dropping the row. Acts
    # already retrieved on merit above keep their full text; the rest enter as
    # short scope-check stubs (see _stub_canon_passages) so the guarantee stops
    # consuming the budget depth needs.
    canon = canon_passages(session, embedder, query, _CANON_CELEX)
    passages = _merge_passages(passages, _stub_canon_passages(canon, passages))
    # Political landscape needs current context, which the retrieval above
    # can't supply — semantic_search/canon_passages are deliberately
    # recency-agnostic (legal text doesn't go stale) and never touch
    # press/political-narrative sources at all in practice: they don't rank
    # competitively against formal legal-text queries regardless of how
    # recent they are. This is a separate, capped pass so it can't crowd out
    # the legal grounding the rest of the brief depends on.
    press = _cap_per_source(
        _cap_per_document(
            press_passages(
                session,
                embedder,
                query,
                _PRESS_SOURCE_KEYS,
                days=_PRESS_RECENCY_DAYS,
                k=5,
                min_score=_PRESS_MIN_SCORE,
            ),
            max_per_doc=2,
        ),
        max_per_source=2,
    )
    passages = _merge_passages(passages, press)
    # Hard ceiling on case law, applied once to the assembled set — see
    # _cap_precedent for why no per-facet or per-tier limit can guarantee it.
    passages = _cap_precedent(passages)
    # Whole-instrument context for each retrieved act (see _attach_summaries).
    # After all retrieval, so one query covers the final passage set.
    passages = _attach_summaries(session, passages)
    stakeholders = _stakeholders(session, passages)
    request = build_request(profile, passages, build_stakeholder_block(stakeholders))
    stats = _retrieval_stats(passages, [facet for facet, _ in facets])
    log.info("brief_retrieval", company=profile.name, **stats)

    if dry_run or not passages:
        return {
            "query": query,
            "passages": passages,
            "request": request,
            "briefing": None,
            "retrieval_stats": stats,
        }

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
        pre_issues = _canon_issues(draft_parsed["briefing"], passages) + prio_verdict_issues(
            draft_parsed["briefing"]
        )
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
    issues = _canon_issues(parsed["briefing"], passages) + prio_verdict_issues(
        parsed["briefing"]
    )
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
    return {
        "query": query,
        "passages": passages,
        "canon_notes": issues,
        "retrieval_stats": stats,
        # Structured record of the hinges this brief could not resolve — the
        # input to the follow-up-question audit (see extract_hinges).
        "unresolved_hinges": extract_hinges(parsed["briefing"]),
        **parsed,
    }
