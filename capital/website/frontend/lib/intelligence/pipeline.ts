// The four-stage intelligence pipeline. Code-orchestrated (not a free-roaming
// agent) so progress is deterministic and cost is bounded:
//   1. discover  — Claude + web search → competitor names
//   2. query_db  — local fuzzy match against the corpus (no LLM)
//   3. research  — Claude + web search → product/positioning/financing per peer
//   4. generate  — Claude + structured output → the final report
import Anthropic from "@anthropic-ai/sdk";
import { fmtEur } from "@/lib/format";
import { evaluateEligibility } from "./eligibility";
import { scoreEase, whyEasyLine } from "./ease";
import { assessAll, VERDICT_RANK } from "./verdict";
import { isWatchOnly } from "./watchOnly";
import { recordBrief } from "./record";
import { recordUsage } from "./cost";
import { recordEvent } from "./telemetry";
import { discoverAndResearch } from "./research";
import { fence } from "./untrusted";

/**
 * Every model response passes through here so its cost is counted.
 *
 * The spend ceiling is enforced in euros (see quota.ts), which only works if
 * nothing bills untracked. Wrapping at one point means a new call site has an
 * obvious thing to do, rather than silently raising the real ceiling.
 */
function billed<T extends { model?: string; usage?: unknown }>(res: T, fallbackModel: string): T {
  recordUsage(res.model ?? fallbackModel, res.usage as never);
  return res;
}
import { semanticFundMatch } from "./semantic";
import { ExclusionLog } from "./exclusions";
import { assembleWriterInstructions } from "./contracts";
import {
  findPeersBySubsector,
  isGenericSubsector,
  hydrateGateDetail,
  loadAgentInstructions,
  loadFundProcess,
  loadSignalsDigest,
  matchCompany,
  toIso2,
  type DigestItem,
} from "./corpus";
import {
  applyProfileSignal,
  BAND_INDEX,
  channelLabel,
  buildInstrumentTable,
  DISPLAY_CAP,
  displayInstitutionName,
  founderCountryList,
  instrumentServesCapital,
  VERDICT_POOL,
} from "./shortlist";
import {
  BORROWER_MODELS,
  COMMERCIAL_ANSWER_PREFIX,
  CAPITAL_OPTIONS,
  TICKET_BANDS,
  type ChannelAmount,
  type EligibilityAnswers,
  type EligibilityCheck,
  type CompetitorIntel,
  type CompetitorRecord,
  type CompetitorRow,
  type InstitutionEntry,
  type InstrumentRow,
  type IntelligenceReport,
  type IntelligenceRequest,
  type ProgressEvent,
  type SelfRecord,
} from "./types";

// The whole pipeline runs on cheap, fast models, guided by the Opus-authored
// briefs in fund-processes/ (especially _agent_instructions.md, a strict rubric).
// The two web-search stages use Sonnet 5. The final report is filled into a
// strict JSON schema of short fields, so Haiku 4.5 — given the rubric — writes it
// well at a fraction of the cost and latency. No runtime Opus call, so the
// pipeline lands well under Vercel's 300s function cap (Hobby).
// The memo is the product, so the writer earns a capable model. Sonnet 5 writes
// the executive prose; with only one writer call plus one search call the run
// still lands well under Vercel's 300s cap.
const WRITER_MODEL = "claude-sonnet-5";
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

type Emit = (event: ProgressEvent) => void;

/** Human-readable scoping profile for prompts (writer + intake conditioning). */
function eligibilityContext(e?: EligibilityAnswers, targetMarkets?: string[]): string {
  if (!e && !targetMarkets?.length) return "";
  const band = TICKET_BANDS.find((b) => b.value === e?.ticketBand);
  const model = BORROWER_MODELS.find((m) => m.value === e?.borrowerModel);
  const lines = [
    band ? `Ticket sought: ${band.label}` : "",
    model ? `Borrower model: ${model.label}` : "",
    targetMarkets?.length ? `Target markets for public capital: ${targetMarkets.join(", ")}` : "",
    e?.entityCountries?.length ? `Entities/establishments in: ${e.entityCountries.join(", ")}` : "",
    e?.wouldOpenEntity ? `Would open a local entity where required: ${e.wouldOpenEntity}` : "",
    e?.fteBand ? `Team size: ${e.fteBand} FTE` : "",
    e?.turnoverBand ? `Turnover: ${e.turnoverBand}` : "",
    e?.ownerOver25 === "yes" ? "Has an owner holding 25% or more (SME test needs the linked-enterprise check)" : "",
    e?.nonEuControl === "yes" ? "Majority non-EU controlled (defence lanes restricted)" : "",
    e?.cofinancingBand ? `Co-financing capacity: ${e.cofinancingBand} of project cost` : "",
    e?.lossesOverHalfCapital === "yes"
      ? "FLAG: accumulated losses may exceed half of share capital (undertaking-in-difficulty risk: most GBER aid blocked until equity is restored)"
      : "",
    e?.conditionality?.length ? `Accepts conditions: ${e.conditionality.join(", ")}` : "",
    e?.developmentStage ? `Development stage: ${e.developmentStage.replace(/_/g, " ")}` : "",
    e?.activityCountries?.length ? `Funded activity will sit in: ${e.activityCountries.join(", ")}` : "",
    e?.consortium ? `Consortium-ready (3+ partners): ${e.consortium}` : "",
    e?.bankRelationship ? `Bank relationship that would lend if guaranteed: ${e.bankRelationship}` : "",
    e?.institutionalBacking ? `Institutional investors aboard or anchoring: ${e.institutionalBacking}` : "",
    e?.needBy ? `Capital needed: ${e.needBy.replace(/_/g, " ")}` : "",
  ].filter(Boolean);
  return lines.length ? `## Scoping profile (structured intake, AUTHORITATIVE)\n${lines.join("\n")}` : "";
}

/** Human phrase for the founder's selected capital types, or "" when none/all. */
function capitalSoughtLabel(values?: string[]): string {
  if (!values || values.length === 0 || values.length >= CAPITAL_OPTIONS.length) return "";
  const labels = CAPITAL_OPTIONS.filter((o) => values.includes(o.value)).map((o) => o.label);
  return labels.join(", ");
}

/**
 * House rule: no em-dashes anywhere. The writer model breaks this silently, so we
 * enforce it in code on its prose. Em-dashes become commas; en-dashes (numeric
 * ranges like €0.5M–€2.5M) are left untouched. Applied only to model-written
 * fields, never to the code-built tables.
 */
function deDash(s: string): string {
  return s
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// The brief's "5 institutions to target" table is deliberately tighter than
// the preliminary verdict's DISPLAY_CAP — a lean founder gets a shortlist,
// not a menu.
const BRIEF_INSTITUTION_CAP = 5;
/** Below this the brief reads as a non-answer, so the writer may not reject its
 *  way past it. The corpus itself may still supply fewer — a genuinely excluded
 *  business (tobacco, gambling, weapons) has fewer real doors, and padding the
 *  table would mean offering funds it cannot use. */
const BRIEF_INSTITUTION_MIN = 2;
/** How many candidates the WRITER is shown. Comfortably more than the five
 *  that ship, because the brief's shape is FIVE institutions and three
 *  successive filters thin the pool before the writer sees it: off-theme
 *  large-scale channels, duplicate institution names, conclusively blocked
 *  funds. Three of the first six real memos shipped four or three rows. More
 *  than the five that ship, so
 *  it can discard the ones it can see are hopeless and still leave a full
 *  table. Reading real memos, four of Neura Robotics' five institutions were
 *  "one thing in the way" and three told the founder to skip them — the
 *  verdict engine only counts ENCODED rules, so a fund can be plainly wrong on
 *  stage or theme and still score as one small obstacle away. The writer can
 *  see that; it just had no way to act on it. */
// Lowered from 9. The writer must return a note per candidate, and a
// candidate it never mentions is dropped silently — it cannot be published
// without model-written copy, and filling that in from a template is what put
// three "Verify eligibility directly with the fund" rows in Nortal's brief.
// At 9 it started omitting: Aleph Alpha came back covering 5 of 9, losing two
// Horizon clusters and two Innovation Fund routes with no judgement attached.
// Only 5 are ever published and ranking upstream already put the best first,
// so 7 is ample headroom for a disqualification or two while staying inside
// what the writer reliably covers.
/** Used when the writer returns an empty caveat. Mirrors the wording the
 *  prompt asks for: committed amounts, uneven coverage, absence is not proof. */
const DEFAULT_CAVEAT =
  "Figures are committed amounts recorded in public registers, not disbursed " +
  "cash; coverage varies by country and instrument, and absence from the " +
  "database is not proof that no funding was received.";

const WRITER_CANDIDATE_CAP = 7;
/** "€2.5M EIC · €1.8M dev banks" — the top doors, with figures where known. */
function fundingBreakdown(channelAmounts: ChannelAmount[]): string {
  return channelAmounts
    .slice(0, 3)
    .map((c) => (c.eur > 0 ? `${fmtEur(c.eur)} ${channelLabel(c.channel)}` : channelLabel(c.channel)))
    .join(" · ");
}

/** "2021–2024", "2023", or "" when no dated event is on file. */
function activeYears(first: number, last: number): string {
  if (!first && !last) return "";
  if (!first) return String(last);
  if (!last || first === last) return String(first);
  return `${first}–${last}`;
}

/** Pull the first fenced JSON block (or the first {...}/[...]) out of model text. */
function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error("No JSON found in model response");
  // Walk to the matching closing bracket so trailing prose is ignored. Track
  // string state so braces/brackets *inside* string values don't throw off the
  // depth count (that would slice the JSON mid-string -> "unterminated string").
  const open = raw[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      end = i + 1;
      break;
    }
  }
  const candidate = raw.slice(start, end === -1 ? undefined : end);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // The model occasionally emits raw control characters (unescaped newlines,
    // tabs) INSIDE string literals — invalid JSON. Escape them string-aware:
    // control chars between tokens are legal whitespace and must stay.
    let out = "";
    let inS = false;
    let e2 = false;
    for (const ch of candidate) {
      if (inS) {
        if (e2) e2 = false;
        else if (ch === "\\") e2 = true;
        else if (ch === '"') inS = false;
        else if (ch === "\n") { out += "\\n"; continue; }
        else if (ch === "\t") { out += "\\t"; continue; }
        else if (ch === "\r") continue;
        else if (ch.charCodeAt(0) < 0x20) continue;
      } else if (ch === '"') {
        inS = true;
      }
      out += ch;
    }
    return JSON.parse(out) as T;
  }
}

/**
 * Build the comparable-companies table deterministically. euCapital and channels
 * come ONLY from the DB match (never the model, never the open web); maturity and
 * positioning are web colour. `records` is aligned 1:1 with `intel` (records =
 * intel mapped through matchCompany), so they share an index.
 *
 * HARD RULE (user, 2026-07-09): a company appears in the table ONLY if it has
 * traced public funding. Web-found names with no DB match are dropped here —
 * the study tracks public support, not the venture market, so "found on the
 * web but no public funding" is not a row, it is an absence.
 */
function buildCompetitors(
  records: CompetitorRecord[],
  intel: CompetitorIntel[],
): CompetitorRow[] {
  return records.flatMap((r, i) => {
    if (!r.matched) return [];
    const web = intel[i];
    return [{
      name: web?.name || r.name || "Unknown",
      source: "web" as const,
      country: r.country,
      euCapital: r.euCapitalEur > 0 ? fmtEur(r.euCapitalEur) : "Amount not disclosed",
      channelBreakdown: fundingBreakdown(r.channelAmounts),
      channels: r.channels,
      activeYears: activeYears(r.firstYear, r.lastYear),
      // Web colour goes into table cells, so it obeys the no-em-dash rule too.
      stage: deDash(web?.maturity || "Unknown"),
      positioning: deDash(web?.positioning || "Unknown"),
    }];
  });
}

/** Database-native peers (same sub-sector, all funded) → comparable rows. */
function buildDbPeers(peers: CompetitorRecord[]): CompetitorRow[] {
  return peers.map((r) => ({
    name: r.name,
    source: "corpus" as const,
    country: r.country,
    euCapital: fmtEur(r.euCapitalEur),
    channelBreakdown: fundingBreakdown(r.channelAmounts),
    channels: r.channels,
    activeYears: activeYears(r.firstYear, r.lastYear),
    stage: "Unknown",
    positioning: `Funded in your sub-sector (${r.subsector.replace(/_/g, " ")})`,
  }));
}

/** For one institution's channel: the 2-3 comparable companies (web-found
 *  peers + DB-native sub-sector peers, excluding the founder) that drew on
 *  exactly that channel, ranked by amount on that channel. Code-built —
 *  never the model's choice, so the brief can never name a firm that didn't
 *  actually use this door. */
function comparableFirmsForChannel(
  channel: string,
  records: CompetitorRecord[],
  dbPeers: CompetitorRecord[],
): { name: string; amount: string }[] {
  return [...records, ...dbPeers]
    .filter((r) => r.matched && r.channels.includes(channel))
    .map((r) => ({
      name: r.name,
      eur: r.channelAmounts.find((c) => c.channel === channel)?.eur ?? 0,
    }))
    .sort((a, b) => b.eur - a.eur)
    .slice(0, 3)
    .map((r) => ({ name: r.name, amount: r.eur > 0 ? fmtEur(r.eur) : "amount not disclosed" }));
}

// Capital-type -> plain-English "type of support" label. Falls back to a
// per-channel default when the row didn't resolve to a DB-native leaf with
// its own capitalType (see selectLeafInstruments).
const CAPITAL_TYPE_LABEL: Record<string, string> = {
  grant: "Grant", loan: "Loan", guarantee: "Guarantee", counter_guarantee: "Guarantee",
  recoverable_advance: "Recoverable advance", equity: "Equity stake",
  blended: "Grant + equity (blended)", tax_credit: "Tax credit",
};
const CHANNEL_SUPPORT_TYPE: Record<string, string> = {
  national_dev_banks: "Loan / guarantee",
  state_aid_satr: "Grant / tax relief",
  eic: "Grant + equity (blended)",
  eit: "Grant + venture support",
  horizon_eu_pillar_ii: "Grant",
  horizon_eu_partnership: "Grant",
  eib: "Loan / venture debt",
  innovation_fund: "Grant",
  edf: "Grant",
  chips_ju: "Grant",
  ipcei: "Grant (state aid)",
};
function supportTypeLabel(row: InstrumentRow): string {
  const base = (row.capitalType && CAPITAL_TYPE_LABEL[row.capitalType])
    || CHANNEL_SUPPORT_TYPE[row.channel]
    || "Grant";
  // state_aid_satr is a REGISTER (the State Aid Transparency Register — where
  // this data was published), not a fund. Every leaf under it is a specific
  // national scheme run by a specific government body (see
  // displayInstitutionName below); the support-type label makes that explicit
  // rather than reading like a single pan-EU vehicle called "SATR."
  return row.channel === "state_aid_satr" ? `${base} (national government, state aid)` : base;
}

/**
 * The brief's centrepiece table, code-built: one row per given instrument
 * row, each with its objective facts finalised here (institution, channel,
 * supportType, ticket, comparableFirms). whyEligible/nextStep start empty —
 * synthesize() fills them from the model's narrative after synthesis, keyed
 * positionally (see rowKeys there), NOT by `channel`: buildInstrumentTable
 * can legitimately emit two rows on the same channel (two DB-native leaf
 * instruments, e.g. two distinct Bpifrance schemes), so `channel` alone is
 * not a unique row identifier.
 */
function buildInstitutions(
  rows: InstrumentRow[],
  records: CompetitorRecord[],
  dbPeers: CompetitorRecord[],
): InstitutionEntry[] {
  return rows.map((row) => ({
    institution: displayInstitutionName(row),
    channel: row.channel,
    supportType: supportTypeLabel(row),
    ticket: row.ticket,
    country: row.country,
    legalBasis: row.legalBasis,
    whyEligible: "",
    comparableFirms: comparableFirmsForChannel(row.channel, records, dbPeers),
    nextStep: "",
  }));
}

/** The founder's own footprint in the corpus, formatted for the BLUF. */
function buildSelf(r: CompetitorRecord): SelfRecord {
  return {
    matched: r.matched,
    euCapital: !r.matched
      ? "No public funding traced"
      : r.euCapitalEur > 0
        ? fmtEur(r.euCapitalEur)
        : "Amount not disclosed",
    channelBreakdown: r.matched ? fundingBreakdown(r.channelAmounts) : "",
    channels: r.matched ? r.channels : [],
    activeYears: r.matched ? activeYears(r.firstYear, r.lastYear) : "",
  };
}

// The standing offer closing the state-of-play section lives in types.ts as
// STATE_OF_PLAY_OFFER and is RENDERED as its own block by the report
// component. It used to be string-concatenated onto this field, which put a
// sales line inside a paragraph of analysis (contract rule SOP-2).

async function synthesize(
  req: IntelligenceRequest,
  records: CompetitorRecord[],
  intel: CompetitorIntel[],
  dbPeers: CompetitorRecord[],
  self: SelfRecord,
  instrumentTable: InstrumentRow[],
  instructions: string,
  sectorTop: string,
  emit: Emit,
  log: ExclusionLog,
): Promise<Omit<IntelligenceReport, "company" | "generatedAt"> & {
  /** Pipeline diagnostics, NOT part of the founder-facing report — stripped
   *  in runIntelligence before the report event is emitted. Recorded on
   *  brief_records so a short brief can be explained after the fact. */
  _dropped: { blocked: number; watchOnly: number; candidates: number };
}> {
  const profileBlock = eligibilityContext(req.eligibility, req.targetMarkets);
  // Stage D (v1): the deterministic eligibility screen — computed here, in
  // code, from the verified term records. The writer narrates it; the rows
  // themselves are never model-written.
  // Scoped to the shortlist. Unscoped this returns ~350 rows across all 322
  // instruments — it rendered as a 35,000-pixel wall below the memo and buried
  // the thing the founder came for. Per-instrument qualification now lives on
  // the institution rows (verdict.ts); this screen is the framework checks plus
  // the rules behind the funds actually on the table.
  // Phase two of hydration: the source citations this screen renders, and the
  // verbatim quotes the adaptive round asks from, are fetched only for the
  // instruments that actually reach the founder. Awaited here because
  // evaluateEligibility reads gate.source synchronously.
  await hydrateGateDetail(
    instrumentTable.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)));
  const eligibilityScreen = evaluateEligibility(
    req.eligibility,
    // Head of the pool only. The pool is deliberately wide so blocked funds can
    // be backfilled, but the screen is a founder-facing table — scoping it to
    // the whole pool is what made it a 35,000-pixel wall in the first place.
    instrumentTable.slice(0, DISPLAY_CAP)
      .map((r) => r.instrumentId).filter((id): id is string => Boolean(id)),
  );
  const screenBlock = eligibilityScreen.length
    ? "## Eligibility screen (AUTHORITATIVE, code-evaluated against primary law)\n" +
      eligibilityScreen.map((r) =>
        `- ${r.check}: ${r.status.toUpperCase()} — ${r.finding}` +
        (r.cure ? ` Cure: ${r.cure}` : "") +
        ` [${r.source.file}${r.source.locator ? ", " + r.source.locator : ""}]`,
      ).join("\n") +
      "\nYour bottom-line bullets and every institution's whyEligible must be " +
      "CONSISTENT with these rows (never claim an eligibility a NOT_MET row " +
      "closes without naming the cure first; treat UNKNOWN rows as a " +
      "verification step, not a claim)."
    : "";
  // Phase 4: the model's OWN read of the founder's free-text description —
  // deliberately NOT labeled AUTHORITATIVE, unlike every block above. Only
  // present when it diverges from what the founder self-selected; the writer
  // may mention it as colour, never as fact, never overriding the founder's
  // own pick or the eligibility screen.
  const softSignalBlock =
    // Self-guarding: when the type was INFERRED rather than stated,
    // runIntelligence sets companyType to techDepthRead, so this is false and
    // no divergence note fires. It only speaks when a founder actually stated
    // a type that the description contradicts.
    req.profileSignal && req.profileSignal.techDepthRead !== req.companyType
      ? `## Free-text read (SOFT SIGNAL — not authoritative, not verified)\n` +
        `The founder's own description reads more like "${req.profileSignal.techDepthRead}" ` +
        `than the "${req.companyType ?? "unstated"}" they selected under Company type. ` +
        `Reason: ${req.profileSignal.note}\n` +
        `You may mention this as a nuance if it's genuinely useful, but never ` +
        `treat it as fact, never let it override the founder's own selection or ` +
        `the eligibility screen, and never present it with the same certainty ` +
        `as the AUTHORITATIVE blocks above.`
      : "";

  // Current-landscape grounding: build-time export of the intelligence corpus
  // (signals_digest.json). The digest captures the FULL A-Z topic universe on
  // every build; tailoring to THIS founder happens here, at the last moment —
  // capital sought, sector, and the channels actually used in the field pick
  // which slices the writer sees. "positioning" and "stateOfPlay" may ONLY be
  // grounded in these lines — no invention.
  const digest = loadSignalsDigest();
  const fieldChannels = new Set(
    instrumentTable.filter((r) => r.usedInField).map((r) => r.channel));
  const topics = new Set<string>(["competitiveness_fund", "startup_scaleup"]);
  const cap = new Set(req.capitalSought ?? []);
  const wantsEverything = cap.size === 0;
  // Scale capital: cheap, abundant financing for industrial-scale operations —
  // always on the menu for loan/equity seekers and capital-intensive sectors.
  if (wantsEverything || cap.has("loan") || cap.has("equity")) {
    topics.add("scale_capital");
    topics.add("investeu");
  }
  if (wantsEverything || cap.has("grant") || cap.has("recoverable_advance") ||
      cap.has("tax_credit")) {
    topics.add("horizon_eic");
    topics.add("national_dev_banks");
    topics.add("state_aid_reform");
  }
  const INDUSTRIAL = new Set([
    "energy_cleantech", "industrial_manufacturing", "materials_chemicals",
    "semiconductors_electronics", "mobility_transport",
  ]);
  if (INDUSTRIAL.has(sectorTop)) {
    topics.add("industrial_policy");
    topics.add("innovation_fund");
    topics.add("ipcei");
    topics.add("scale_capital");
  }
  if (sectorTop === "defense_security") topics.add("defence");
  if (sectorTop === "space") topics.add("space");
  if (sectorTop === "software_data_ai") topics.add("digital_ai");
  if (sectorTop === "semiconductors_electronics") topics.add("chips");
  if (sectorTop === "energy_cleantech") topics.add("eit_kics");
  if (req.companyType === "Deep-tech breakthrough") topics.add("step");
  const bandIdx = req.eligibility?.ticketBand ? BAND_INDEX[req.eligibility.ticketBand] : undefined;
  if (bandIdx !== undefined && bandIdx >= 3) {
    topics.add("scale_capital");
    topics.add("investeu");
    topics.add("ipcei");
    topics.add("industrial_policy");
  }
  if (req.eligibility?.borrowerModel === "balance_sheet_lender" ||
      req.eligibility?.borrowerModel === "originator") {
    topics.add("investeu");
    topics.add("scale_capital");
  }
  for (const [ch, t] of [
    ["ipcei", "ipcei"], ["edf", "defence"], ["chips_ju", "chips"],
    ["eit", "eit_kics"], ["innovation_fund", "innovation_fund"],
    ["eib", "scale_capital"],
  ] as const) {
    if (fieldChannels.has(ch)) topics.add(t);
  }
  const formatDigestItem = (it: DigestItem & { tag: string }) =>
    `- [${it.tag}] ${it.title} (${it.source}${it.date ? `, ${it.date}` : ""}): ` +
    `${it.excerpt.slice(0, 320)}`;
  // "positioning" agenda grounding: what's on the policy agenda right now,
  // relevance-ranked (same topic tailoring the old landscape section used).
  const agendaItems: (DigestItem & { tag: string })[] = digest
    ? [
        ...[...topics].flatMap((t) =>
          (digest.topics[t] ?? []).slice(0, 2).map((it) => ({ ...it, tag: t }))),
        ...(digest.sectors[sectorTop] ?? digest.sectors["other"] ?? [])
          .slice(0, 3)
          .map((it) => ({ ...it, tag: "your sector" })),
      ]
    : [];
  const agendaEvidence = agendaItems.map(formatDigestItem).join("\n");
  // "positioning" namedrop grounding: who is actually shaping that agenda
  // right now, most recent first. Plain recency join (not a similarity
  // search) — see _people() in signals_digest.py.
  const peopleEvidence = (digest?.people ?? [])
    .slice(0, 10)
    .map((p) =>
      `- ${p.person} (${p.signalType.replace(/_/g, " ")}; ${p.source}` +
      `${p.date ? `, ${p.date}` : ""}): ${p.title}. ${p.excerpt.slice(0, 220)}`)
    .join("\n");
  // "stateOfPlay" grounding: the same tailored evidence pool, re-sorted by
  // recency instead of relevance — a founder's "state of play" should lead
  // with what just happened, not merely what's on-topic.
  const recentEvidence = [...agendaItems]
    .filter((it) => it.date)
    .sort((a, b) => (a.date! < b.date! ? 1 : -1))
    .slice(0, 4)
    .map(formatDigestItem)
    .join("\n");

  // The comparable-company evidence pool: web-found direct comparables plus
  // same-sub-sector DB-native peers. Grounds bottomLine and whyEligible; the
  // per-institution comparableFirms list below is built from the same
  // records but code-finalised, never restated by the model.
  const competitors = [...buildCompetitors(records, intel), ...buildDbPeers(dbPeers)];
  const evidence = competitors
    .map((c) => {
      const where = c.country ? ` (${c.country})` : "";
      const tag = c.source === "corpus" ? " [same sub-sector, from database]" : "";
      const traced = c.channelBreakdown
        ? `${c.euCapital} — ${c.channelBreakdown}${c.activeYears ? `, ${c.activeYears}` : ""}`
        : c.euCapital;
      return (
        `- ${c.name}${where}${tag}: EU/public capital ${traced}; ` +
        `positioning — ${c.positioning}; maturity — ${c.stage}`
      );
    })
    .join("\n");

  // The founder's own footprint, so bottomLine can open with where THEY stand.
  const selfLine = self.matched
    ? `${req.company}: EU/public capital ${self.euCapital}` +
      `${self.channelBreakdown ? ` — ${self.channelBreakdown}` : ""}` +
      `${self.activeYears ? `, ${self.activeYears}` : ""}`
    : `${req.company}: no public funding traced in our database (which is not ` +
      `proof of none — coverage varies by country).`;

  // Inject only the process briefs for channels that actually appear.
  const channels = [
    ...new Set([
      ...records.flatMap((r) => (r.matched ? r.channels : [])),
      ...dbPeers.flatMap((r) => r.channels),
    ]),
  ];
  const processes = channels
    .map((c) => loadFundProcess(c))
    .filter(Boolean)
    .join("\n\n---\n\n");

  const capitalPref = capitalSoughtLabel(req.capitalSought);
  const ctx = [
    `Founder's company: ${req.company}`,
    req.sector ? `Sector: ${req.sector}` : "",
    req.country ? `Country: ${req.country}` : "",
    req.companyType ? `Company type (founder's own words): ${req.companyType}` : "",
    req.description ? fence("company description", req.description) : "",
    capitalPref
      ? `Capital sought (founder's preference): ${capitalPref}. Respect this as a ` +
        `filter and a ranking signal: lead with these capital types, demote and ` +
        `flag the cost of anything that conflicts (e.g. equity/blended dilution ` +
        `when they asked for non-dilutive).`
      : "",
    req.clarifications && req.clarifications.length > 0
      ? `Founder's clarifications (their own answers to targeted questions, ` +
        `AUTHORITATIVE about their situation): ` +
        req.clarifications.map((c) => `${c.question} -> ${c.answer}`).join("; ") +
        `. Use these to read archetype, ticket floor, dilution tolerance and ` +
        `consortium-willingness, and route accordingly.`
      : "",
    // brief_funnel_v2 Stage 2b. This is the block that makes the brief read
    // like it was written for THIS company: each line is the founder's own
    // answer to a question phrased from one fund's verbatim requirement.
    // Split by origin. The gate-grounded answers describe the project against
    // a fund's rules; the commercial ones describe how the business makes
    // money and carry no instrument. Merged into one list they read as though
    // a fund had asked about the business model, which is exactly the
    // confusion that put statute vocabulary into a sentence about a company.
    (req.projectAnswers ?? []).filter((p) => !p.questionId?.startsWith(COMMERCIAL_ANSWER_PREFIX)).length > 0
      ? `## The founder's project, against real fund requirements (AUTHORITATIVE)\n` +
        (req.projectAnswers ?? [])
          .filter((p) => !p.questionId?.startsWith(COMMERCIAL_ANSWER_PREFIX))
          .map(
            (p) =>
              `- ${p.instrumentName} requires: "${p.quote}"\n` +
              `  Asked: ${p.question}\n` +
              `  They answered: ${p.answer}`,
          )
          .join("\n") +
        `\nThese are the sharpest facts you have about what this company ` +
        `actually does. Use them concretely: name the specific requirement and ` +
        `how this company sits against it, rather than describing the fund in ` +
        `general terms. Where an answer shows a requirement is not met, say so ` +
        `plainly and give the cure. Never restate an answer as a fact the ` +
        `founder did not give.`
      : "",
    // The commercial half of round 2. Its only consumers are positioning and
    // the payoff bullet — it never touches eligibility, and it is labelled so
    // the writer cannot mistake it for a fund requirement.
    (req.projectAnswers ?? []).filter((p) => p.questionId?.startsWith(COMMERCIAL_ANSWER_PREFIX)).length > 0
      ? `## How this business actually works (AUTHORITATIVE, the founder's own answers)\n` +
        (req.projectAnswers ?? [])
          .filter((p) => p.questionId?.startsWith(COMMERCIAL_ANSWER_PREFIX))
          .map((p) => `- ${p.question}\n  They answered: ${p.answer}`)
          .join("\n") +
        `\nThis is the ONLY basis for anything you say about who this company ` +
        `sells to, how it reaches them, or what an award would buy. Positioning ` +
        `advice must fit this commercial model. Where it is silent, write about ` +
        `the technology and the policy priority, never about a customer.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  // The brief's centrepiece table, finalised in code (institution, channel,
  // supportType, ticket, comparableFirms) — the model only supplies
  // whyEligible/nextStep per row, keyed positionally by rowKeys below (never
  // by `channel` alone: two rows can share a channel, see buildInstitutions).
  // brief_funnel_v2 Stage 3: re-rank on EASE before cutting to five, so the
  // brief leads with the doors this company can most plausibly walk through
  // rather than simply the best-fitting ones. Fit ordering (exact country,
  // then ticket proximity, then event count) survives as the tie-break: rows
  // with no ease signal at all keep their original position.
  const comparableCounts = new Map<string, number>();
  for (const row of instrumentTable) {
    if (!row.instrumentId) continue;
    comparableCounts.set(
      row.instrumentId,
      [...records, ...dbPeers].filter((r) => r.matched && r.channels.includes(row.channel)).length,
    );
  }
  const easeById = scoreEase(
    instrumentTable.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)),
    req.eligibility,
    req.projectAnswers,
    comparableCounts,
    eligibilityScreen,
    // Demote national schemes the founder cannot actually use. A German
    // company was being handed an Estonian equity scheme at rank 2, which the
    // writer then had to apologise for in the row itself.
    new Set(
      founderCountryList(req.country, req.targetMarkets, req.eligibility?.entityCountries)
        .map((c) => toIso2(c))
        .filter(Boolean)
        .map((c) => c.toUpperCase()),
    ),
  );
  // Qualification comes before ease. A door that is open, or one thing away
  // from open, outranks a door that merely scores well — and a door that is
  // conclusively shut is dropped rather than ranked, because a roster of
  // rejections is not advice.
  const assessments = assessAll(
    instrumentTable.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)),
    req.eligibility,
  );
  // A scheme with no award on record for years may be closed, repealed or
  // simply between programme periods — we cannot tell which, and neither can
  // the founder. Three years is deliberately generous: EU programme periods
  // have real gaps and the register lags, so a tighter window would flag live
  // schemes.
  //
  // A MISSING date is explicitly NOT stale, though the first version of this
  // treated it as such. 51 instruments carry no dated award, and they include
  // Bpifrance, EIFO, KfW and Almi — loaded as placeholder-level records rather
  // than per-award rows. That is a gap in our ingestion, not evidence a
  // national development bank has stopped lending, and demoting them would
  // have pushed Silvr's single best route down the table. Absence of evidence
  // is not evidence of absence.
  const STALE_AFTER_YEARS = 3;
  const thisYear = new Date().getFullYear();
  const isStale = (row: InstrumentRow) =>
    row.lastAwardYear !== undefined &&
    thisYear - row.lastAwardYear > STALE_AFTER_YEARS;

  const capitalMismatch = (row: InstrumentRow) =>
    Boolean(row.capitalType) && (req.capitalSought?.length ?? 0) > 0 &&
    !instrumentServesCapital(row.capitalType as string, req.capitalSought as string[]);
  const rankedByEase = instrumentTable
    .map((row, i) => ({
      row, i,
      ease: row.instrumentId ? easeById.get(row.instrumentId) : undefined,
      assessment: row.instrumentId ? assessments.get(row.instrumentId) : undefined,
    }))
    .sort((a, b) => {
      const ra = VERDICT_RANK[a.assessment?.status ?? "unknown"];
      const rb = VERDICT_RANK[b.assessment?.status ?? "unknown"];
      if (ra !== rb) return ra - rb;
      // Then: does this row answer the question the founder actually asked?
      // selectLeafInstruments relaxes capital type when a country has no leaf
      // serving what was requested — defensible for one row, indefensible for
      // a table. sennder asked for grants and loans and got HTGF and Coparion,
      // two equity stakes, while its own bullet said to route non-dilutive
      // asks through dev-bank grants instead. Demoted rather than dropped:
      // when a founder genuinely has no matching route, an equity vehicle the
      // memo openly flags as a conflict beats an empty table.
      // Live before stale: a fund still awarding beats one we cannot show has
      // awarded anything in years, whatever else is true about it.
      const sa = isStale(a.row), sb = isStale(b.row);
      if (sa !== sb) return sa ? 1 : -1;
      const ma = capitalMismatch(a.row), mb = capitalMismatch(b.row);
      if (ma !== mb) return ma ? 1 : -1;
      return (b.ease?.score ?? 0) - (a.ease?.score ?? 0) || a.i - b.i;
    });

  // Never show a founder a fund they cannot access — no exceptions, no
  // backfill. A short table of real options beats a padded one, and a fund
  // that is conclusively shut is time the founder does not get back. In
  // practice the table stays full: `unknown` counts as accessible, and most
  // instruments carry no encoded filter yet.
  // One row per institution NAME, not per instrument id. 322 instruments
  // share only 143 display names, so two leaves of the same body can both
  // survive ranking and the founder sees "Enterprise Ireland" twice in one
  // table — once open, once not assessable — which reads as a broken brief.
  // Ranking already put the better row first, so first-wins is the right rule.
  const droppedBlocked = rankedByEase.filter((r) => r.assessment?.status === "blocked").length;
  const seenNames = new Set<string>();
  const beforeWriterCap = rankedByEase
    .filter((r) => {
      if (r.assessment?.status !== "blocked") return true;
      log.record("VER-BLOCKED", r.row.instrumentId ?? r.row.channel,
        `${r.assessment.blockers.length} encoded eligibility filters conclusively fail`);
      return false;
    })
    .filter((r) => {
      const name = displayInstitutionName(r.row);
      if (seenNames.has(name)) {
        log.record("SEL-DUPE-NAME", r.row.instrumentId ?? r.row.channel,
          "a higher-ranked instrument already renders under this institution name");
        return false;
      }
      seenNames.add(name);
      return true;
    });
  for (const r of beforeWriterCap.slice(WRITER_CANDIDATE_CAP)) {
    log.record("SEL-LEAF-CAP", r.row.instrumentId ?? r.row.channel,
      `ranked below the ${WRITER_CANDIDATE_CAP}-candidate cap shown to the writer`);
  }
  const baseRows = beforeWriterCap.slice(0, WRITER_CANDIDATE_CAP).map((r) => r.row);
  const institutions = buildInstitutions(baseRows, records, dbPeers).map((entry, idx) => {
    const id = baseRows[idx].instrumentId;
    const a = id ? assessments.get(id) : undefined;
    return {
      ...entry,
      whyEasy: whyEasyLine(id ? easeById.get(id) : undefined, entry.institution),
      lastAwardYear: baseRows[idx].lastAwardYear,
      stale: isStale(baseRows[idx]),
      verdict: a?.status ?? "unknown",
      // Only ever one blocker reaches the founder — a row with two or more is
      // `blocked` and was already dropped above.
      blocker: a?.blockers[0]?.requirement,
      gatesChecked: a?.checked ?? 0,
    };
  });
  // Stream what's already known, well before the writer model call below
  // resolves: self footprint, eligibility screen and the institution rows
  // (whyEligible/nextStep still "" here — the client renders those as
  // placeholders until the final "report" event replaces this).
  // Preview only the rows that could actually ship. The writer is shown more
  // candidates than are published, and streaming all of them would flash eight
  // rows that then collapse to five.
  emit({ type: "partial", data: {
    self, eligibilityScreen, institutions: institutions.slice(0, BRIEF_INSTITUTION_CAP),
  } });
  const seenRowKeys = new Set<string>();
  const rowKeys = baseRows.map((row) => {
    let key = row.instrumentId ?? row.channel;
    while (seenRowKeys.has(key)) key += "#";
    seenRowKeys.add(key);
    return key;
  });
  const institutionsEvidence = institutions
    .map((r, i) => {
      const row = baseRows[i];
      const firms = r.comparableFirms.length
        ? r.comparableFirms.map((f) => `${f.name} (${f.amount})`).join(", ")
        : "none traced yet";
      return (
        `- key "${rowKeys[i]}" (${r.institution})` +
        `${row.usedInField ? " [used by peers in your field]" : ""}` +
        `${r.stale ? ` [STALE — no award on record since ${r.lastAwardYear}]` : ""}` +
        `${row.fitFlag ? ` [${row.fitFlag}]` : ""}: ` +
        // The verdict, and the obstacle where there is one. Without this the
        // writer cannot see which row is blocked, so it left blockerPlain empty
        // every time and the raw statute rendered in the table instead.
        `screening says ${r.verdict === "one_blocker" ? "ONE THING IN THE WAY" : r.verdict === "open" ? "OPEN (nothing rules them out)" : "not assessable"}; ` +
        `${r.blocker ? `the obstacle, verbatim: "${r.blocker}"; ` : ""}` +
        `support ${r.supportType}; ticket ${r.ticket}; ` +
        `${r.legalBasis ? `legal basis ${r.legalBasis}; ` : ""}` +
        `comparable firms funded through it: ${firms}`
      );
    })
    .join("\n");
  const channelEnum = rowKeys;

  // Schema is built per-request (not a static const): institutionNotes must
  // cover exactly this founder's candidate rows, enum-constrained the same
  // way generateGroundedRound() constrains its field enum below. The JSON
  // property is still called "channel" on the wire, but its value is the
  // disambiguated rowKey, not necessarily the literal channel code.
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      // The API's structured-output arrays support neither minItems > 1 nor
      // maxItems — exact counts (4-5 bullets, one note per channel) are
      // enforced by the prompt instructions plus the post-merge fallback
      // below (mirrors how the old schema relied on prompt + .slice(), never
      // minItems/maxItems, for watchItems/funderMap/todos).
      bottomLine: { type: "array", items: { type: "string" } },
      institutionNotes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            channel: { type: "string", enum: channelEnum.length ? channelEnum : [""] },
            whyEligible: { type: "string" },
            nextStep: { type: "string" },
            // Plain-English restatement of a "one thing in the way" rule.
            // Rides on the writer call that already runs, so it costs no extra
            // latency — the alternative was rendering 200+ characters of raw
            // statute in a table cell.
            blockerPlain: { type: "string" },  // "" when the row has no blocker
            /** false = do not put this in front of the founder at all. */
            worthPursuing: { type: "boolean" },
            /** false = real, but nothing to do about it yet (see prompt). */
            actionableNow: { type: "boolean" },
          },
          // blockerPlain is REQUIRED, not optional: left optional the model
          // simply omitted it every time and the raw statute rendered instead.
          // Empty string is the documented answer for rows with no blocker.
          required: ["channel", "whyEligible", "nextStep", "blockerPlain", "worthPursuing", "actionableNow"],
        },
      },
      positioning: { type: "string" },
      stateOfPlay: { type: "string" },
      caveats: { type: "string" },
    },
    required: ["bottomLine", "institutionNotes", "positioning", "stateOfPlay", "caveats"],
  } as const;

  // STREAMED, not create(). The budget below is large enough that the SDK
  // refuses a non-streaming request outright ("Streaming is required for
  // operations that may take longer than 10 minutes"), which killed every memo
  // the moment the budget was raised. Streaming lifts that ceiling; the awaited
  // finalMessage() has the same shape as create(), so nothing downstream
  // changes. Do not convert this back to create() without also lowering
  // max_tokens below the SDK's threshold.
  // A hung stream is worse than a failed one: with no bound, one bunq run sat
  // on an open connection for 69 minutes before the socket dropped -- for a
  // founder, an indefinite spinner.
  //
  // The SDK's own `timeout` option is not enough here. It did not stop the
  // stream (no attempt ever logged a completion), and the SDK RETRIES on
  // timeout, so the ceiling multiplies: the same run still took 42 minutes
  // before surfacing "Request timed out". So retries are off and the deadline
  // is enforced here, with an explicit abort, giving a hard worst case of two
  // attempts rather than an open-ended one.
  // Both attempts have to fit inside the route's maxDuration (300s, see
  // app/api/intelligence/route.ts) or the retry is killed by the platform
  // before it can save the memo -- which would make the fallback useless in
  // exactly the case it exists for. Research has already run by this point, so
  // the split is deliberately lopsided: a generous first attempt, then a
  // shorter one that has no thinking to pay for and needs far less.
  // Measured healthy adaptive writer runs vary far more than one sample
  // suggests: 24s (Aleph Alpha) to 136s (Photoroom). A 90s budget looked
  // generous against the first number and would have aborted the second, so
  // the ceiling is set from the SLOWEST healthy run seen, not the typical one.
  //
  // Getting this wrong is not fatal, which is why 150s rather than 200s: an
  // aborted healthy run still produces a memo through the thinking-off retry,
  // so a tight deadline trades quality for latency, never success. It is the
  // pathological case (bunq) that pays, burning the full budget before the
  // retry can start.
  const WRITER_TIMEOUT_MS = 150_000;
  const WRITER_RETRY_TIMEOUT_MS = 90_000;
  const writerCall = (thinking: "adaptive" | "disabled") => client.messages.stream({
    model: WRITER_MODEL,
    // Raised from 16000 when the writer went from 5 candidates to 9: that is
    // far more structured output on top of adaptive thinking, and a GovTech run
    // truncated mid-string at ~1.9k chars of JSON, losing a three-minute memo.
    max_tokens: 24000,
    // Sonnet 5 rejects fixed thinking budgets (400); adaptive lets the model
    // size the prioritisation judgement itself — but it can also spend the
    // entire budget thinking and emit nothing, so the caller retries with it
    // off rather than losing the memo (see below).
    thinking: { type: thinking },
    system: assembleWriterInstructions(),
    output_config: { format: { type: "json_schema", schema } },
    messages: [
      {
        role: "user",
        content:
          // The per-section rules used to live here, ~200 lines of prose
          // interleaved with evidence assembly. They now live in contracts/,
          // which the system prompt carries in full, so this message is only
          // the task and the evidence. Changing what a section says is a
          // markdown edit; changing what evidence it gets is a change here.
          `Write the founder's public-capital brief, obeying every contract in ` +
          `your instructions.\n\n${ctx}\n\n` +
          `${profileBlock ? profileBlock + "\n\n" : ""}` +
          `${screenBlock ? screenBlock + "\n\n" : ""}` +
          `${softSignalBlock ? softSignalBlock + "\n\n" : ""}` +
          `## The founder's own footprint (AUTHORITATIVE)\n${selfLine}\n\n` +
          `## Comparable-company evidence (AUTHORITATIVE, already finalised)\n` +
          `Every company listed here has traced public funding; the figures ` +
          `are committed amounts from our database. Use them EXACTLY as ` +
          `given, and never introduce a round, a figure or a funder not ` +
          `listed here.\n` +
          `${evidence || "(no comparable companies gathered)"}\n\n` +
          `## The candidate institutions (AUTHORITATIVE, already finalised)\n` +
          `These are the ONLY institutions you may write about. Return one ` +
          `institutionNotes entry per row, keyed by the exact "channel" value ` +
          `shown after "key" (two rows can share a fund family under different ` +
          `keys; they are separate institutions and each needs its own note). ` +
          `Support type, ticket and comparable firms already render in the ` +
          `table: write only whyEligible, nextStep and blockerPlain.\n` +
          `A row marked STALE has no award on record for over three years.\n` +
          `Every row has been screened against its own encoded eligibility ` +
          `rules; funds this company cannot access were already removed.\n` +
          `Order your entries BEST FIRST. We publish the top rows of what you ` +
          `return, so ranking a fund last is how you say it is the weakest ` +
          `option, and that costs the founder nothing.\n` +
          `${institutionsEvidence || "(none)"}\n\n` +
          `## Funding-process briefs (use to make nextStep concrete)\n` +
          `${processes || "(none)"}\n\n` +
          `## What is on the policy agenda now (grounds "positioning")\n` +
          `${agendaEvidence || "(nothing usable for this sector right now)"}\n\n` +
          `## Who is shaping that agenda (the ONLY basis for naming a person)\n` +
          `${peopleEvidence || "(no person-level signal; refer to roles and institutions only)"}\n\n` +
          `## Most recent developments (recency-sorted, grounds "stateOfPlay")\n` +
          `${recentEvidence || "(nothing recent for this sector, say so plainly)"}`,
      },
    ],
  }, { timeout: WRITER_TIMEOUT_MS, maxRetries: 0 });

  const textOf = (m: Anthropic.Message) => m.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const timed = async (thinking: "adaptive" | "disabled") => {
    const budget = thinking === "adaptive" ? WRITER_TIMEOUT_MS : WRITER_RETRY_TIMEOUT_MS;
    const t0 = Date.now();
    const stream = writerCall(thinking);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const m = billed(await Promise.race([
        stream.finalMessage(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            stream.abort();
            reject(new Error(`writer exceeded ${budget}ms`));
          }, budget);
        }),
      ]), WRITER_MODEL);
      console.log("[writer] thinking=%s %ss stop=%s out=%d chars",
        thinking, Math.round((Date.now() - t0) / 1000), m.stop_reason, textOf(m).length);
      return m;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  let res: Anthropic.Message | null = null;
  try {
    res = await timed("adaptive");
  } catch (err) {
    // A blown deadline is not fatal on its own — the retry below runs without
    // thinking, which is both faster and unable to fail the same way.
    recordEvent("writer_timeout", String(err), { candidates: rowKeys.length });
  }
  let text = res ? textOf(res) : "";
  // Adaptive thinking can spend almost the whole budget reasoning, leaving too
  // little for the answer. bunq -- a licensed neobank, so a case with genuinely
  // tangled sector-exclusion reasoning -- hit this twice: once emitting no text
  // at all, once emitting 1,273 characters of JSON that stopped mid-string.
  // Both are equally unusable, so the trigger is stop_reason, NOT whether any
  // text came back; an earlier version keyed on empty text and simply moved the
  // failure from "no text" to "unterminated string".
  //
  // Retrying once with thinking OFF puts the entire budget into output, which
  // cannot hit the same wall. A slightly less considered brief beats none, and
  // this costs a second call only in the rare case it fires.
  if (!res || res.stop_reason === "max_tokens") {
    recordEvent("writer_truncated", "writer produced nothing usable; retrying with thinking off",
      { candidates: rowKeys.length, chars: text.length, stop: res?.stop_reason ?? "timeout" });
    res = await timed("disabled");
    text = textOf(res);
  }
  if (!text.trim()) {
    throw new Error(`writer returned no text (stop_reason=${res.stop_reason})`);
  }
  // A truncated response throws deep inside JSON.parse with no context. Say
  // what actually happened, so the next occurrence is one log line to diagnose
  // rather than a mystery SyntaxError.
  if (res.stop_reason === "max_tokens") {
    console.error("writer hit max_tokens — output truncated, memo will fail to parse",
      { candidates: rowKeys.length, chars: text.length });
  }
  const narrative = extractJson<{
    bottomLine: string[];
    institutionNotes: { channel: string; whyEligible: string; nextStep: string;
                        blockerPlain?: string; worthPursuing?: boolean;
                        actionableNow?: boolean }[];
    positioning: string;
    stateOfPlay: string;
    caveats: string;
  }>(text);

  // Merge the model's per-row notes onto the code-built institution rows
  // (never the reverse — the model cannot add, drop or reorder a row),
  // keyed by rowKeys (positional, disambiguates same-channel rows — see
  // buildInstitutions), and strip em-dashes from every model-written field
  // (house rule).
  const notesByKey = new Map(narrative.institutionNotes.map((n) => [n.channel, n]));
  // The writer ranks by the order it returns the notes in; anything it did not
  // mention sorts last. The CUT to five happens in code, so the model can
  // express "this is the weakest" without being able to delete a usable row.
  const rankByKey = new Map(narrative.institutionNotes.map((n, i) => [n.channel, i]));
  const scored = institutions.map((row, i) => {
    const note = notesByKey.get(rowKeys[i]);
    return {
      // Absent note = DROP. This inverted when the writer started seeing more
      // candidates than ship: a row it never wrote about is one it did not
      // think worth writing about, and keeping it published the fallback
      // boilerplate instead. Nortal shipped three of five rows reading "Verify
      // eligibility directly with the fund", two of them thematic mismatches
      // (a health JU and a semiconductor JU for a govtech company) that
      // survived purely because the writer had ignored them.
      // The min-2 floor below still protects against an empty table.
      worth: Boolean(note) && note?.worthPursuing !== false,
      // Not something to act on if the writer SAID so, or if its own copy
      // says so anyway — it kept rows flagged actionable while writing
      // "Monitor the next call" and "Deprioritise unless the grant pipeline
      // falls short" into the next step.
      actionable: !isWatchOnly(note?.actionableNow, note?.nextStep, note?.whyEligible),
      key: rowKeys[i],
      entry: {
        ...row,
        whyEligible: deDash(note?.whyEligible ?? "Verify eligibility directly with the fund."),
        nextStep: deDash(note?.nextStep ?? "Review the fund's current call and eligibility criteria."),
        // Prefer the plain restatement; fall back to the verbatim rule so the
        // obstacle is never silently dropped just because the writer omitted it.
        blocker: row.blocker ? deDash(note?.blockerPlain || row.blocker) : undefined,
      } as InstitutionEntry,
    };
  });
  // Always log the funnel: a brief that ships three rows from seven
  // candidates is not visible in the output itself, and this is the only
  // place the writer's rejections can be counted.
  const omitted = rowKeys.filter((k) => !notesByKey.has(k));
  const rejected = institutions
    .map((row, i) => ({ row, note: notesByKey.get(rowKeys[i]) }))
    .filter((x) => x.note?.worthPursuing === false)
    .map((x) => x.row.institution);
  console.log("[institutions] candidates=%d kept=%d rejected=%d omitted=%d%s%s",
    institutions.length, scored.filter((x) => x.worth).length, rejected.length, omitted.length,
    rejected.length ? " | rejected: " + rejected.join(", ") : "",
    omitted.length ? " | omitted: " + omitted.join(", ") : "");

  // Up to five, never fewer than two — except where two genuinely do not
  // exist. A tobacco or gambling business is excluded from most state aid by
  // law, and padding its brief back to five would mean inventing options it
  // cannot use. So the floor applies to the WRITER's judgement (it may not
  // reject its way down to one), not to the corpus: if screening only ever
  // produced one accessible fund, one is the honest answer.
  // The writer may disqualify at most one candidate, and code enforces it.
  //
  // The contract asks for "none or one", and asking is not enough: a live run
  // rejected five of seven candidates, among them the two best-known EU
  // instruments for that company, and shipped a two-row brief. The previous
  // prompt fought this with roughly forty lines of guardrail, which is the
  // tell that prose cannot hold the line.
  //
  // Rejections are honoured from the BOTTOM of the writer's own ordering: if
  // it wants several gone, the one it ranked last is the one that goes. That
  // keeps the flag meaningful without letting it empty the table, and it is
  // the same division as everywhere else — the writer ranks, code cuts.
  const MAX_WRITER_REJECTIONS = 1;
  const rejectedByRank = scored
    .filter((x) => !x.worth)
    .sort((a, b) => (rankByKey.get(b.key) ?? Infinity) - (rankByKey.get(a.key) ?? Infinity));
  const honoured = new Set(rejectedByRank.slice(0, MAX_WRITER_REJECTIONS).map((x) => x.key));
  for (const x of rejectedByRank.slice(MAX_WRITER_REJECTIONS)) {
    x.worth = true;
    recordEvent("writer_over_rejected",
      "writer disqualified more candidates than the cap allows; row reinstated",
      { channel: x.entry.channel, rejected: rejectedByRank.length });
  }
  for (const x of scored) {
    if (x.worth || !honoured.has(x.key)) continue;
    // Two different failures wear the same result. Separating them matters:
    // one is the writer actively rejecting a fund, the other is the writer
    // never mentioning it, and only the first is a judgement we could argue
    // with.
    const note = notesByKey.get(x.key);
    log.record(note ? "WRT-NOT-WORTH" : "WRT-NO-NOTE",
      x.entry.channel,
      note ? "writer set the disqualification flag" : "writer returned no note for this candidate");
  }
  const ranked = scored
    .filter((x) => x.worth)
    .sort((a, b) => (rankByKey.get(a.key) ?? Infinity) - (rankByKey.get(b.key) ?? Infinity));
  // A brief NEVER shows a fund that is deprioritised or not relevant. Not one
  // as a tail-ender, not one for balance: a row the founder cannot move on is
  // a thing to know, and the brief is a list of things to do. Three of
  // sennder's five rows were "deprioritise" / "monitor calls" / "treat as
  // informational" -- each honest on its own, together a padded table that
  // costs the reader time and costs us credibility.
  //
  // The count is allowed to fall below the usual floor as a result. Four real
  // routes beat five with one that wastes a week.
  const actionable = ranked.filter((x) => x.actionable);
  const watchOnly = ranked.filter((x) => !x.actionable);
  const worthwhile = actionable.map((x) => x.entry);
  if (watchOnly.length) {
    console.log("[institutions] dropped %d watch-only: %s", watchOnly.length,
      watchOnly.map((x) => x.entry.institution).join(", "));
    for (const x of watchOnly) {
      log.record("WRT-WATCH-ONLY", x.entry.channel,
        "flagged not-actionable, or its own next step matched the watch-only vocabulary");
    }
  }
  // Deliberately NOT topped back up to the minimum from the watch-only pile:
  // that would reintroduce exactly the rows we just refused to show. A short
  // brief is the honest answer when a founder genuinely has few live routes.
  //
  // The one exception is the pathological case where NOTHING survives -- if
  // the writer mislabels every row, an empty table serves no one, so the
  // ranked list stands in and the event is logged loudly rather than hidden.
  const survivors = worthwhile.length ? worthwhile : ranked.map((x) => x.entry);
  for (const e of survivors.slice(BRIEF_INSTITUTION_CAP)) {
    log.record("CUT-CAP", e.channel, `ranked below the published cap of ${BRIEF_INSTITUTION_CAP}`);
  }
  const finalInstitutions: InstitutionEntry[] = survivors.slice(0, BRIEF_INSTITUTION_CAP);
  if (!worthwhile.length) {
    console.error("every institution read as watch-only; showing ranked order instead",
      { candidates: scored.length });
  } else if (worthwhile.length < BRIEF_INSTITUTION_MIN) {
    // Not necessarily wrong — the user's call is to ship what is real rather
    // than pad — but it is the signal worth watching, because a RISE in these
    // means the pool or the rules changed, not that founders got unluckier.
    recordEvent("thin_brief", "brief below the usual 2-row floor after dropping watch-only rows",
      { kept: worthwhile.length, droppedWatchOnly: watchOnly.length, candidates: scored.length });
  }

  return {
    self,
    eligibilityScreen,
    bottomLine: narrative.bottomLine.slice(0, 5).map((b) => deDash(b)),
    institutions: finalInstitutions,
    positioning: deDash(narrative.positioning),
    stateOfPlay: deDash(narrative.stateOfPlay),
    // The caveat is what stops committed-amount figures reading as a promise
    // of disbursed cash, so it is not optional even though the model sometimes
    // returns it empty (Corti's thinking-off run did). Schema `required` gets
    // the key emitted, not filled.
    caveats: deDash(narrative.caveats)?.trim() || DEFAULT_CAVEAT,
    // Diagnostics, stripped before the report is emitted (see runIntelligence).
    // They exist so brief_records can explain a short brief after the fact
    // rather than leaving it to be guessed at.
    _dropped: { blocked: droppedBlocked, watchOnly: watchOnly.length,
                candidates: scored.length },
  };
}

/**
 * The fast path: a deterministic eligibility verdict with zero model calls,
 * so a founder sees it in well under a second instead of waiting through the
 * full memo's web research. Self-only/preliminary — DB match plus
 * same-sub-sector DB peers, no web-discovered comparables. runIntelligence()
 * later reruns buildInstrumentTable() with the richer web+DB peer evidence
 * the full memo gathers, but always with the same ticketBand/consortium
 * rules, so the fast verdict is only ever extended, never contradicted.
 */
/** What the model-free fast path returns: a deterministic screen plus the
 *  candidate ids that ground the adaptive round. */
export interface VerdictResult {
  eligibilityScreen: EligibilityCheck[];
  instrumentTable: InstrumentRow[];
  selfMatched: boolean;
  candidateInstrumentIds: string[];
}

export async function computeVerdict(
  company: string,
  country: string | undefined,
  eligibility: EligibilityAnswers | undefined,
  opts: {
    targetMarkets?: string[]; capitalSought?: string[]; description?: string;
    /** Optional funnel recorder. The fast path is model-free but not
     *  exclusion-free: most of what never reaches a founder is removed here. */
    log?: ExclusionLog;
  } = {},
): Promise<VerdictResult> {
  const selfRecord = matchCompany(company, country);
  const targetSub =
    selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
  const dbPeers = targetSub
    ? findPeersBySubsector(targetSub, { country, limit: 4, exclude: [company] })
    : [];
  const fieldChannels = new Set<string>([
    ...(selfRecord.matched ? selfRecord.channels : []),
    ...dbPeers.flatMap((r) => r.channels),
  ]);
  const founderCountries = founderCountryList(country, opts.targetMarkets, eligibility?.entityCountries);
  const candidates = buildInstrumentTable({
    fieldChannels,
    ticketBand: eligibility?.ticketBand,
    consortiumOk: eligibility?.consortium !== "no",
    founderCountries,
    capitalSought: opts.capitalSought ?? [],
    description: opts.description,
    log: opts.log,
  });
  // Phase two of hydration, on the FAST path too. computeVerdict is
  // model-free, not IO-free: its eligibility screen renders the source
  // citation for each rule, and without this every row came back with a blank
  // one — 0 of 25 on a live call. "Instant" means no model round-trip; one
  // scoped query for the seven instruments on the table is not what makes this
  // path slow, and a rule shown without its source is not evidence.
  const candidateIds = candidates
    .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
  await hydrateGateDetail(candidateIds);
  return {
    eligibilityScreen: evaluateEligibility(eligibility, candidateIds),
    instrumentTable: candidates.slice(0, DISPLAY_CAP),
    selfMatched: selfRecord.matched,
    candidateInstrumentIds: candidateIds,
  };
}

/** Run the full pipeline, emitting progress events as each stage completes. */
export async function runIntelligence(req0: IntelligenceRequest, emit: Emit): Promise<void> {
  const startedAt = Date.now();
  // One recorder for the whole request. Every fund removed between here and
  // the published table reports to it, so a brief that ships three rows can
  // be explained rather than guessed at. Purely observational — see
  // exclusions.ts.
  const log = new ExclusionLog();
  // The first screen stopped asking "company type" on 2026-07-26: it gated no
  // eligibility rule and inferProfileSignal already reads the same 4-point
  // scale off the founder's own description. So the model's read IS the
  // archetype now, and everything downstream (STEP topic selection, the
  // prompt's archetype line, depth-sensitive channel ordering) reads it
  // through this one resolution rather than an empty string.
  const req: IntelligenceRequest = req0.companyType
    ? req0
    : { ...req0, companyType: req0.profileSignal?.techDepthRead };
  const instructions = loadAgentInstructions();

  emit({ type: "status", step: "discovering", detail: "Searching the record and the open web for comparable companies" });
  // Comparables corroborate the brief; they are not the brief. The memo's
  // substance is the instrument corpus and DB-native peers, both of which are
  // local and cannot time out. So a failed or slow search degrades to no
  // comparables rather than taking the whole request down with it.
  let intel: CompetitorIntel[] = [];
  try {
    intel = await discoverAndResearch(req, instructions);
  } catch (err) {
    recordEvent("research_degraded", `comparable research failed: ${String(err)}`);
  }

  emit({ type: "status", step: "querying_db", detail: `Found ${intel.length} candidates; matching against the funding record` });
  const records = intel.map((i) => matchCompany(i.name, i.country));
  const selfRecord = matchCompany(req.company, req.country);
  const self = buildSelf(selfRecord);

  // Database-native peers: target the founder's own sub-sector if we matched
  // them, else the most common sub-sector among the matched web peers. These are
  // guaranteed-funded companies in the same space, independent of web matching.
  // Only a *specific* sub-sector yields meaningful peers; catch-all buckets are
  // skipped (findPeersBySubsector returns none for them anyway, but we also avoid
  // selecting one as the target so a specific bucket among the web peers can win).
  let targetSub =
    selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
  if (!targetSub) {
    const subs = records
      .filter((r) => r.matched && r.subsector && !isGenericSubsector(r.subsector))
      .map((r) => r.subsector);
    const freq = new Map<string, number>();
    for (const s of subs) freq.set(s, (freq.get(s) ?? 0) + 1);
    targetSub = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }
  const exclude = [req.company, ...intel.map((i) => i.name)];
  const dbPeers = targetSub
    ? findPeersBySubsector(targetSub, { country: req.country, limit: 4, exclude })
    : [];

  // Semantic fund matching (instrument_profiles via pgvector). One Voyage query
  // embed plus one HNSW lookup, ~100ms against a pipeline that already runs for
  // ~100s. Resolves to an empty map on any failure, in which case
  // buildInstrumentTable silently falls back to the lexical index — the memo
  // must never fail because a vector query timed out.
  const semanticScores = await semanticFundMatch(req.description);

  // The capital on the table: every channel the founder or a peer has drawn on,
  // topped up to a useful shortlist. Built in code from curated fund snapshots.
  const fieldChannels = new Set<string>([
    ...(selfRecord.matched ? selfRecord.channels : []),
    ...records.flatMap((r) => (r.matched ? r.channels : [])),
    ...dbPeers.flatMap((r) => r.channels),
  ]);
  const instrumentTable = applyProfileSignal(
    buildInstrumentTable({
      fieldChannels,
      ticketBand: req.eligibility?.ticketBand,
      consortiumOk: req.eligibility?.consortium !== "no",
      founderCountries: founderCountryList(req.country, req.targetMarkets, req.eligibility?.entityCountries),
      capitalSought: req.capitalSought ?? [],
      description: req.description,
      semantic: semanticScores,
      log,
    }).slice(0, VERDICT_POOL),
    req.profileSignal,
    req.companyType,
  );

  emit({ type: "status", step: "generating", detail: "Assembling evidence: institutions, comparables, current agenda" });
  // The founder's own answer now sits in this chain, because intake and the
  // corpus finally share one vocabulary. Before the split it could not: intake
  // said `health_lifesciences` where the corpus said `health_life_sciences`,
  // and six corpus sectors had no intake option at all, so an unmatched
  // company fell through to "other" and got generic topic routing — which is
  // most startups, the exact users this is for. A company IN the record still
  // wins, since its classification is NACE-derived rather than self-reported.
  const sectorTop =
    (selfRecord.matched && selfRecord.sectorTop) ||
    dbPeers.find((p) => p.sectorTop)?.sectorTop ||
    records.find((r) => r.matched && r.sectorTop)?.sectorTop ||
    req.eligibility?.sector ||
    "other";
  const body = await synthesize(
    req, records, intel, dbPeers, self, instrumentTable, instructions, sectorTop, emit, log);

  const { _dropped, ...report } = body;
  emit({
    type: "report",
    data: {
      company: req.company,
      generatedAt: new Date().toISOString(),
      ...report,
    },
  });
  emit({ type: "status", step: "done" });

  // Written AFTER the brief has been emitted, and never awaited: recording
  // what we showed must not be able to slow or break delivering it. See
  // record.ts for why this exists at all — bench_report can tell whether a
  // brief is well formed, but nothing could tell whether it was right.
  recordBrief({
    company: req.company,
    country: req.country,
    description: req.description,
    eligibility: req.eligibility,
    capitalSought: req.capitalSought,
    institutions: report.institutions.map((i) => ({
      institution: i.institution, channel: i.channel, country: i.country,
      verdict: i.verdict, blocker: i.blocker, stale: i.stale,
    })),
    droppedBlocked: _dropped.blocked,
    droppedWatchOnly: _dropped.watchOnly,
    candidateCount: _dropped.candidates,
    exclusions: log.countsByRule(),
    durationMs: Date.now() - startedAt,
    codeVersion: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
  });
}
