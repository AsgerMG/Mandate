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
import { instrumentLink } from "./instrumentLink";
import { assessAll } from "./verdict";
import { isWatchOnly } from "./watchOnly";
import { recordBrief } from "./record";
import { agentSelectEnabled, agentSelectMemoPool, AGENT_SELECT_SEAM } from "./agentSelect";
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
import { BRIEF_LIMITS, checkBrief } from "./briefChecks";
import { accessiblePool, explainNoDoors, orderMemoCandidates, WRITER_CANDIDATE_CAP } from "./memoCandidates";
import { ExclusionLog } from "./exclusions";
import { assembleInstructions, assembleWriterInstructions } from "./contracts";
import { buildProvenance } from "./provenance";
import { AXIS_LABEL, distinguisherPhrases, rowGroups } from "./rowNovelty";
import {
  findPeersBySubsector,
  isGenericSubsector,
  hydrateGatesFor,
  loadFundProcess,
  loadSignalsDigest,
  matchCompany,
  toIso2,
  withheldNotice,
  type DigestItem,
} from "./corpus";
import {
  applyProfileSignal,
  opensLargeScaleLane,
  CAPITAL_SOUGHT_TO_DB,
  instById,
  channelLabel,
  buildInstrumentTableHydrated,
  DISPLAY_CAP,
  displayInstitutionName,
  founderCountryList,
  tableInputFromAnswers,
  VERDICT_POOL,
} from "./shortlist";
import type { OpenJudgement } from "./openQuestions";
import { judgeOpenAnswers } from "./openJudge";
import {
  BORROWER_MODELS,
  COMMERCIAL_ANSWER_PREFIX,
  CAPITAL_OPTIONS,
  STATE_OF_PLAY_OFFER,
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
  type WithheldNotice,
} from "./types";

// The whole pipeline runs on cheap, fast models. Every model call takes its
// system prompt from `contracts/`, assembled per stage: the writer reads the
// shared rules plus the four brief sections, the round-2 planner reads the
// shared rules plus its own contract, and the stages that only return a
// judgement read the shared rules alone.
//
// It used to say "guided by the Opus-authored briefs in fund-processes/
// (especially _agent_instructions.md, a strict rubric)". That file was never a
// rubric for anything on this line: it went to the question planner, a
// 400-token classifier, the eligibility judge and the web researcher, and the
// memo writer -- the only stage it described -- never received it. It is gone;
// the per-channel process briefs in fund-processes/ remain and are injected as
// EVIDENCE into the writer's user message, which is what they always were.
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
    e?.organisationType ? `Kind of organisation: ${e.organisationType.replace(/_/g, " ")}` : "",
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

// How many rows the brief publishes. NOT a second literal: it is the same
// number `checkBrief` enforces as FUND-2 and the same number the writer is
// told in `contracts/brief/02-funds.md`, because a cut and the check on that
// cut holding separate copies of one constant is the defect that shipped a
// sixth row into the screen and dropped it from the memo for months.
//
// It was 5 while `DISPLAY_CAP` was 6, so the preliminary verdict was strictly
// MORE generous than the paid memo: the screen built, screened and rendered a
// row the brief then discarded. That was never a decision, it was two
// constants that had never been read side by side.
const BRIEF_INSTITUTION_CAP = BRIEF_LIMITS.institutionsMax;
/** Below this the brief reads as a non-answer, so the writer may not reject its
 *  way past it. The corpus itself may still supply fewer — a genuinely excluded
 *  business (tobacco, gambling, weapons) has fewer real doors, and padding the
 *  table would mean offering funds it cannot use. */
const BRIEF_INSTITUTION_MIN = 2;
/** Used when the writer returns an empty caveat. Mirrors the wording the
 *  prompt asks for: committed amounts, uneven coverage, absence is not proof. */
const DEFAULT_CAVEAT =
  "Figures are committed amounts recorded in public registers, not disbursed " +
  "cash; coverage varies by country and instrument, and absence from the " +
  "database is not proof that no funding was received.";

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
export const CAPITAL_TYPE_LABEL: Record<string, string> = {
  grant: "Grant", loan: "Loan", guarantee: "Guarantee", counter_guarantee: "Guarantee",
  recoverable_advance: "Recoverable advance", equity: "Equity stake",
  // `blended` names no kind of capital. It is what `family_capital_type` emits
  // when no kind cleared its 60% threshold, so a label asserting grant AND
  // equity states a composition we did not resolve and, on this corpus, do not
  // hold: not one publishable blended instrument has an equity award, and the
  // largest is a national debt programme of 2,977 loan and guarantee awards.
  //
  // This column is founder-facing, and until INDEFINITE_CAPITAL landed the
  // error was hidden: only a founder who ticked equity could see one of these
  // rows at all. Admitting them to everyone's pool is what makes the label load
  // -bearing, so it is corrected in the same branch that admitted them —
  // otherwise the fix would have traded a fund nobody could see for a fund
  // described wrongly to everyone.
  //
  // The honest label says the kind is unresolved and where to settle it, rather
  // than guessing. See INDEFINITE_CAPITAL in shortlist.ts.
  blended: "Mixed (kind varies by call)", tax_credit: "Tax credit",
  // Neither of these should ever reach a founder: `publishableInstruments()`
  // withholds both by declaration (see offerableAxes.ts), so a row carrying one
  // is out of the corpus before ranking begins. They are labelled anyway, and
  // the reason is the same one that made this map load-bearing in the first
  // place. Every unlabelled value falls through to `CHANNEL_SUPPORT_TYPE`,
  // which asserts something confident and channel-shaped: `unknown` on the EIT
  // channel rendered as "Grant + venture support" and on the development-bank
  // channel as "Loan / guarantee". Both were wrong about the funds this
  // workstream fixed — the French one is a grant and the EIT RawMaterials one
  // takes equity — and the fallback would have stated the opposite of each with
  // no hedge. A silent default that guesses is worse than a value that admits
  // what it does not know, so the map answers for every value the column can
  // hold, not only the ones expected to be seen.
  non_financial: "Support only (no capital)",
  undetermined: "Kind of capital not stated by the source",
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
    schemeCode: row.schemeCode,
    schemeOperators: row.schemeOperators,
    accessMode: row.accessMode,
    applicationUrl: row.applicationUrl,
    applicationChannel: row.applicationChannel,
    applicationRouteFor: row.applicationRouteFor,
    applicationRouteUnknown: row.applicationRouteUnknown,
    // Resolved in code so the row carries a link the writer cannot invent.
    link: instrumentLink(row),
    // Carried through, and they were NOT. InstrumentRow has computed both since
    // the shortlist was written, InstitutionEntry declares both, and
    // InstitutionsTable renders both ("What we can check" / "How the money
    // works") -- but this mapping never copied them, so neither block has ever
    // appeared in a memo. Found by generating a real brief on the live site and
    // looking at it: every automated check passed, because nothing asserts that
    // a field survives the row -> entry hop.
    //
    // These are the only two things on the row that are the FUND's own words
    // rather than the writer's, which is exactly why they belong in front of a
    // founder.
    // Every one of these was declared on InstitutionEntry, computed on
    // InstrumentRow, and rendered by InstitutionsTable -- and none was carried
    // across. The memo has therefore never shown what a fund typically awards,
    // what share of a project it actually covered, or the fund's own words
    // about who it is for. `typicalAward` is the same median whose absence from
    // Postgres was found this morning to be mis-ranking production; it was
    // fixed in the store and still could not reach the page.
    //
    // Optional fields plus a hand-written mapping is the shape of this bug:
    // omitting one is legal TypeScript, so nothing objected. rowToEntry.test.ts
    // now asserts the hop for every field the table reads.
    typicalAward: row.typicalAward,
    typicalAwardN: row.typicalAwardN,
    aidIntensity: row.aidIntensity,
    aidIntensityN: row.aidIntensityN,
    descriptor: row.descriptor,
    familyName: row.familyName,
    judgementCriteria: row.judgementCriteria,
    structuringNotes: row.structuringNotes,
    whyEligible: "",
    comparableFirms: comparableFirmsForChannel(row.channel, records, dbPeers),
    nextStep: "",
  }));
}

/**
 * THE CANDIDATES, GROUPED, WITH WHAT SEPARATES THEM: the exact block the
 * writer is handed.
 *
 * ── What it replaced, and why ──────────────────────────────────────────────
 * A flat list, one line per candidate, every line carrying the same six facts:
 * name, verdict, support type, ticket, legal basis, comparables. For a run of
 * siblings under one programme FIVE OF THOSE SIX ARE IDENTICAL BY
 * CONSTRUCTION. The ticket is the channel's curated band; the legal basis is
 * the article the whole regime was notified under; the comparables pool is one
 * to three companies wide (wsCX); the route is inherited from the parent when
 * a leaf has none of its own.
 *
 * Measured over 250 founders at the published cap, 1,750 rows: 39% of
 * published rows sit in a run of two or more rows of one kind, 38% of tables
 * carry a run of three or more, and inside a table the support type repeats on
 * 72% of rows, the ticket on 70%, the legal basis on 67% and the family on
 * 64%. The writer was handed one row several times and wrote one sentence
 * several times, and both briefs rendered at seven rows read as a catalogue
 * from row four down. It was not padding and it was not the cut.
 *
 * ── Why this is a presentation fix and not a selection one ────────────────
 * EVERY row that follows another row of its own kind still carries a fact no
 * earlier row carried: 432 of 432 over the same 250 founders, 27 of 27 over
 * the archetypes. They differ on what they typically award (all of them, and
 * by an order of magnitude inside a single run), on their own stated
 * conditions (53%), on how the money is shaped (50%), on what they fund (41%),
 * on who takes the application (19%). NONE of that reached this block. The
 * differences existed and nothing put them in front of the model being asked
 * to differentiate.
 *
 * So the shared facts are stated ONCE per run and each row carries what is its
 * own. NOTHING IS DROPPED: a row that shares nothing forms a run of one and
 * reads exactly as it did before, and no candidate is ever withheld -- a
 * wrongly-withheld row is a fund a founder never sees.
 *
 * Exported so `scripts/_wsde_prompt.ts` can render what the writer actually
 * receives for free. A second implementation of this block in a script would
 * be grading something no founder is served.
 */
export function writerCandidateEvidence(
  institutions: InstitutionEntry[],
  rowKeys: string[],
  /** Per-row flags the shortlist computed, positionally aligned. */
  meta: { usedInField?: boolean; fitFlag?: string }[],
): string {
  return rowGroups(institutions)
    .map((g) => {
      const head = g.size > 1
        ? `\nThese ${g.size} are the same kind of door and the page states these facts ONCE ` +
          `for all of them: ${g.shared.map((s) => `${AXIS_LABEL[s.axis] ?? s.axis} ${s.value}`).join("; ")}. ` +
          `A note repeating any of them tells the reader nothing they have not already read. ` +
          `Each note must turn on what separates its own row, which is listed on the row.\n`
        : "";
      return head + institutions.slice(g.start, g.start + g.size).map((r, o) => {
        const i = g.start + o;
        const row = meta[i] ?? {};
        const firms = r.comparableFirms.length
          ? r.comparableFirms.map((f) => `${f.name} (${f.amount})`).join(", ")
          : "none traced yet";
        // What this row has that no earlier row had. Empty on the first row of
        // the table by construction, and empty on a row that genuinely repeats
        // one -- which is a fact worth the writer SEEING rather than hiding,
        // because the honest note for such a row is a different note.
        // Never on the first row: nothing stands above it, so "what sets this
        // row apart" would name every fact it has and mean nothing by it.
        const apart = i === 0 ? [] : distinguisherPhrases(r, institutions.slice(0, i));
        return (
          `- key "${rowKeys[i]}" (${r.institution})` +
          `${row.usedInField ? " [used by peers in your field]" : ""}` +
          `${r.stale ? ` [STALE, no award on record since ${r.lastAwardYear}]` : ""}` +
          `${row.fitFlag ? ` [${row.fitFlag}]` : ""}: ` +
          // The verdict, and the obstacle where there is one. Without this the
          // writer cannot see which row is blocked, so it left blockerPlain empty
          // every time and the raw statute rendered in the table instead.
          `screening says ${r.verdict === "one_blocker" ? "ONE THING IN THE WAY" : r.verdict === "open" ? "OPEN (nothing rules them out)" : "not assessable"}; ` +
          `${r.blocker ? `the obstacle, verbatim: "${r.blocker}"; ` : ""}` +
          // Inside a run these three are the run's own header, one line above.
          // On a run of one they are the row's, and they stay where they were.
          (g.size > 1
            ? ""
            : `support ${r.supportType}; ticket ${r.ticket}; ` +
              `${r.legalBasis ? `legal basis ${r.legalBasis}; ` : ""}`) +
          `comparable firms funded through it: ${firms}` +
          (i === 0 ? ""
            : apart.length
              ? `\n    WHAT SETS THIS ROW APART from the rows above it: ${apart.join("; ")}`
              : `\n    NOTHING on this row differs from a row above it. Write the one honest ` +
                `reason a founder would open this door as well as that one, or say plainly ` +
                `that it is the same offer from a second body.`)
        );
      }).join("\n");
    })
    .join("\n");
}

/**
 * `buildInstitutions`, reachable from the free table check.
 *
 * A DIRECT CALL, never a second implementation. The alternative -- a check that
 * rebuilds the rows it is grading -- is the defect this repo has paid for
 * repeatedly, and it is worse here than anywhere: the whole point is to grade
 * the rows the founder is handed.
 */
export function buildRowsForCheck(
  rows: InstrumentRow[],
  records: CompetitorRecord[],
  dbPeers: CompetitorRecord[],
): InstitutionEntry[] {
  return buildInstitutions(rows, records, dbPeers);
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
  /** Semantic fund-match scores, computed once by the caller. Passed rather
   *  than recomputed: it is a network round trip, and the shortlist already
   *  ranked on the same numbers. */
  semanticScores: Map<string, number>,
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
  await hydrateGatesFor(
    instrumentTable.map((r) => r.instrumentId).filter((id): id is string => Boolean(id)));
  // ── TWO CONSUMERS, TWO SCOPES, AND ONE OF THEM WAS BORROWING THE OTHER'S ──
  //
  // This screen has two readers and they want opposite things.
  //
  //   the FOUNDER reads it as a table under the memo. Unscoped it returns ~350
  //   rows and rendered as a 35,000-pixel wall that buried the thing they came
  //   for, so it is scoped to the head of the pool. That reason is a layout
  //   reason and it has not changed.
  //
  //   `scoreEase` reads it as a SIGNAL over every row it scores. A verified
  //   `not_met` row there multiplies that fund's ease by 0.25 (ease.ts), and
  //   that demotion is a large part of what keeps a fund the founder cannot
  //   use out of the published table.
  //
  // One call served both, scoped to `DISPLAY_CAP`. `orderMemoCandidates` then
  // scored ease for the WHOLE pool against it, so a fund carrying a verified
  // disqualifying gate could ESCAPE the penalty simply by sitting below the
  // sixth pool row — and then be promoted above a row that was penalised. A
  // cap that is smaller upstream than the list it is applied to does not just
  // throw accuracy away here: it is the wrongly-shown row this product treats
  // as worse than a missing one.
  //
  // So the scopes are now separate and each is derived from its own reason.
  // FREE: `hydrateGatesFor` above already fetched gates for the whole pool, so
  // the wider evaluation makes no query that was not already made.
  const poolInstrumentIds = instrumentTable
    .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
  /** Every row the ordering will score. Never rendered. */
  const eligibilitySignal = evaluateEligibility(req.eligibility, poolInstrumentIds);
  /** What the founder is shown, and what the writer is told is authoritative. */
  const eligibilityScreen = evaluateEligibility(
    req.eligibility, poolInstrumentIds.slice(0, DISPLAY_CAP));
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
  if (opensLargeScaleLane(req.eligibility?.ticketBand)) {
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
  // Fund-level movement, for the funds actually on this founder's table.
  //
  // The agenda above is topic-level: what is happening to the Competitiveness
  // Fund, what is moving in energy. Useful, and it was the only landscape
  // grounding the brief had. This is one level down and it is what makes the
  // back half specific: "the fund in your row 2 opens a EUR 380M call", dated,
  // sourced, and tied to an instrument the founder can actually apply to.
  //
  // Scoped to the table on purpose. A policy development about a fund the
  // founder cannot get is noise dressed as insight.
  const instrumentSignals = (digest?.instruments ?? {});
  const fundMovesEvidence = instrumentTable
    .flatMap((row) => {
      const sigs = row.instrumentId ? instrumentSignals[row.instrumentId] ?? [] : [];
      return sigs.map((s) =>
        `- ${row.instrument} — ${s.date} (${s.type}): ${s.summary}` +
        (s.impact ? ` What it means: ${s.impact}` : "") +
        ` [${s.title} ${s.url}]`);
    })
    .slice(0, 12)
    .join("\n");
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
  //
  // ── The founder's OWN rows come first, and used not to be here at all ────
  // This list was built from `records` and `dbPeers` only: the channels the
  // COMPARABLE COMPANIES drew on. FUND-9 tells the writer that `nextStep` is
  // "one concrete action drawn from the process briefs", so a row whose
  // channel no peer happened to use arrived with no brief to draw it from,
  // while a peer's channel that is on nobody's table brought one along.
  // Which briefs the writer receives was decided by who the web search found.
  //
  // `instrumentTable` is the founder's published rows and is in scope right
  // here. It leads the union, so if this ever has to be truncated the briefs
  // for the rows the founder will actually read survive first. The peers'
  // channels are kept behind them: they ground what the brief says about how
  // comparable companies were funded, which is a different job.
  const channels = [
    ...new Set([
      ...instrumentTable.map((r) => r.channel),
      ...records.flatMap((r) => (r.matched ? r.channels : [])),
      ...dbPeers.flatMap((r) => r.channels),
    ].filter(Boolean)),
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
  const { toWriter, easeById, assessments, droppedBlocked, isStale } = orderMemoCandidates({
    // The SIGNAL scope, not the rendered one: every row this call scores for
    // ease must be a row the screen could have disqualified. See where the two
    // are computed for what sharing one scope was costing.
    instrumentTable, req, records, dbPeers, eligibilityScreen: eligibilitySignal,
    semanticScores, log,
  });
  const baseRows = toWriter.map((r) => r.row);
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
  // candidates than are published -- `check_contracts.ts` fails the build if it
  // ever is not -- and streaming all of them would flash a table that then
  // collapses to the published cap. Both numbers were written out here and both
  // were wrong within a day of the caps moving.
  emit({ type: "partial", data: {
    self, eligibilityScreen, institutions: institutions.slice(0, BRIEF_INSTITUTION_CAP),
    withheld: withheldNotice(log.countsByRule()["SEL-UNCONFIRMED-OPEN"] ?? 0),
  } });
  const seenRowKeys = new Set<string>();
  const rowKeys = baseRows.map((row) => {
    let key = row.instrumentId ?? row.channel;
    while (seenRowKeys.has(key)) key += "#";
    seenRowKeys.add(key);
    return key;
  });
  // ── THE CANDIDATES, GROUPED, WITH WHAT SEPARATES THEM ────────────────────
  //
  // This block used to be a flat list, and every line carried the same six
  // facts: name, verdict, support type, ticket, legal basis, comparables. For
  // a run of siblings under one programme, FIVE OF THOSE SIX ARE IDENTICAL BY
  // CONSTRUCTION -- the ticket is the channel's curated band, the legal basis
  // is the article the whole regime was notified under, the comparables pool
  // is one to three companies wide (wsCX), and the route is inherited from the
  // parent when a leaf has none. Measured over the twelve archetypes at the
  // published cap: 49% of rows sit in a run of two or more rows of one kind,
  // half the tables carry a run of three or more, and inside those runs the
  // support type repeats on 76% of rows, the ticket on 67% and the family on
  // 64%.
  //
  // So the writer was handed one row several times and wrote one sentence
  // several times, and both rendered briefs read as a catalogue from row four
  // down. It was not padding and it was not the cut.
  //
  // What makes it fixable rather than a corpus problem: EVERY row that follows
  // another row of its own kind still carries a fact no earlier row carried --
  // 27 of 27 on the archetypes. They differ on what they typically award
  // (every single one, and by an order of magnitude inside one run), on their
  // own stated conditions, on what they fund, on who takes the application.
  // NONE of that was in this block. The differences existed and nothing put
  // them in front of the model being asked to differentiate.
  //
  // So the shared facts are stated ONCE per run, and each row carries what is
  // its own. Nothing is dropped: a row that shares nothing simply forms a run
  // of one and reads exactly as it did before.
  const institutionsEvidence = writerCandidateEvidence(institutions, rowKeys, baseRows);
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
          },
          // blockerPlain is REQUIRED, not optional: left optional the model
          // simply omitted it every time and the raw statute rendered instead.
          // Empty string is the documented answer for rows with no blocker.
          required: ["channel", "whyEligible", "nextStep", "blockerPlain"],
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
  // Adaptive thinking existed for a judgement the writer no longer makes.
  //
  // It was introduced to let the model size its own prioritisation effort:
  // which candidates to disqualify, how to order them, which to drop. Phase 4
  // moved all of that to a deterministic score. What remains is writing a note
  // per row for rows it is handed, in the order given, which is not a task
  // that needs extended reasoning.
  //
  // Meanwhile the failure mode the original comment warned about had become
  // the common case, not the pathological one: adaptive spent the entire
  // budget thinking and emitted NOTHING on three of four measured runs
  // (chars: 0, stop: timeout at 150s), then the thinking-off retry produced a
  // complete brief in 24-27s. Most briefs were being written by the fallback
  // path, which is also the path that overruns the word caps.
  //
  // So thinking-off is the primary path now and the budget shrinks to match
  // what that path actually takes, with headroom. The retry is kept for
  // genuine failures rather than for a self-inflicted timeout.
  const WRITER_TIMEOUT_MS = 90_000;
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
          `These rows are already ranked and already cut. Write one note per ` +
          `row, in the order given. Do not reorder them, do not omit one, and ` +
          `do not describe them as better or worse than each other.\n` +
          `Rows that are the same kind of door are grouped below, and the facts ` +
          `they share are stated once for the group and rendered once on the ` +
          `page. Never restate a group's shared facts in a row's note. Each ` +
          `note turns on the line marked WHAT SETS THIS ROW APART, which is ` +
          `that row's own facts and no other row's.\n` +
          `${institutionsEvidence || "(none)"}\n\n` +
          `## Funding-process briefs (use to make nextStep concrete)\n` +
          `${processes || "(none)"}\n\n` +
          `## What is on the policy agenda now (grounds "positioning")\n` +
          `${agendaEvidence || "(nothing usable for this sector right now)"}\n\n` +
          `## Movement on the FUNDS IN THE TABLE ABOVE (AUTHORITATIVE, dated)\n` +
          `Each line is a policy development on a specific fund the founder can ` +
          `apply to, from our own corpus, with its date and source. Prefer these ` +
          `over the topic-level agenda when both would serve: a founder acts on ` +
          `"the fund in your row 2 opens a call in Q4", not on "the Commission ` +
          `is consolidating programmes". Cite the date. If this block is empty, ` +
          `their funds are national schemes the policy corpus does not track — ` +
          `fall back to the agenda above and do NOT imply fund-level movement.\n` +
          `${fundMovesEvidence || "(no fund-level movement on this founder's table)"}\n\n` +
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
                        blockerPlain?: string }[];
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
      // A row the writer never wrote about is still dropped: publishing the
      // fallback boilerplate in its place says nothing and reads as an
      // assessment. That is the writer failing to do its job, not the writer
      // exercising judgement about which fund belongs.
      worth: Boolean(note),
      // Watch-only rows are DEMOTED, not deleted. The rule was right — a brief
      // is a list of things to do — but a regex over natural language should
      // not be able to delete a well-ranked fund because a valid next step
      // happened to contain "revisit" or "act if". It sorts to the back and
      // falls off the cut on its own if better rows exist.
      actionable: !isWatchOnly(undefined, note?.nextStep, note?.whyEligible),
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
  const rejected: string[] = [];
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
  for (const x of scored) {
    if (!x.worth) log.record("WRT-NO-NOTE", x.entry.channel, "writer returned no note for this candidate");
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
  // Demotion, not deletion: actionable rows first, the rest behind them in
  // rank order. If five actionable routes exist a watch-only row never
  // reaches the cut anyway; if they do not, a real fund the founder can only
  // monitor beats a shorter table with nothing in its place.
  const actionable = ranked.filter((x) => x.actionable);
  const watchOnly = ranked.filter((x) => !x.actionable);
  const worthwhile = [...actionable, ...watchOnly].map((x) => x.entry);
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

  // ── 90 RULES, 27 PREDICATES, AND NONE OF THEM RAN ON A FOUNDER'S MEMO ───
  //
  // `checkBrief` had call sites in the unit tests, two bench scripts and one
  // build gate that runs on archetype fixtures. It had none anywhere on the
  // request path. So every rule it can decide was decided about hypothetical
  // briefs and never about a published one, and briefChecks.ts records what
  // that cost in its own words: "an empty table shipped, was noticed by a
  // human rendering the page, and cost nothing anywhere in the suite."
  //
  // This is OBSERVATIONAL and must stay that way. It does not gate, retry,
  // repair or withhold: a founder waiting on a memo is not served by us
  // refusing to hand it over, and a check that can block a brief is a check
  // nobody dares tighten. It records, on the real thing, so a rule that fires
  // in production is visible before a human happens to render the page.
  //
  // Wrapped, because a defect in a check must never be able to cost a founder
  // their brief. The check runs last, after the report is fully assembled, and
  // its own failure is an event rather than an exception.
  const publishedReport = {
    self,
    eligibilityScreen,
    // Read, never retyped. This was a literal 5 -- a private copy of
    // `bulletMax`, which BL-1 states to the writer and `checkBrief` enforces,
    // sitting in the one place that actually TRUNCATES. Structurally the same
    // defect as the three independent fives that made the memo discard a row
    // the screen had already built.
    bottomLine: narrative.bottomLine.slice(0, BRIEF_LIMITS.bulletMax).map((b) => deDash(b)),
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

  try {
    // `candidatesShown` is what the writer was SHOWN, not what published --
    // that is the superset BL-B1 needs, and passing it is what stops that rule
    // reporting itself unevaluated on every real request.
    const violations = checkBrief(
      publishedReport, STATE_OF_PLAY_OFFER, scored.map((x) => x.entry.institution));
    if (violations.length) {
      recordEvent("brief_rule_violated",
        violations.map((v) => `${v.ruleId}: ${v.detail}`).join("; "),
        { rules: [...new Set(violations.map((v) => v.ruleId))], count: violations.length });
    }
  } catch (err) {
    recordEvent("brief_check_failed", `checkBrief threw on a published brief: ${String(err)}`);
  }

  return publishedReport;
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
  /** Funds withheld because their openness could not be confirmed against the
   *  live register. Absent when none were, which is the normal state. The fast
   *  path carries it for the same reason the memo does: this screen is the
   *  first thing a founder acts on, and a table that is quietly two rows short
   *  is the version of it that costs them a week. */
  withheld?: WithheldNotice;
}

export async function computeVerdict(
  company: string,
  country: string | undefined,
  eligibility: EligibilityAnswers | undefined,
  opts: {
    targetMarkets?: string[]; capitalSought?: string[]; description?: string;
    /** Verdicts a model already reached about the founder's own prose, read
     *  against requirements no comparator can decide (wsCD). ALREADY DECIDED:
     *  this path stays model-free and zero-cost, exactly as before. Absent,
     *  empty, or arm-off all leave the ranking bit-identical. */
    openJudgements?: OpenJudgement[];
    /** Optional funnel recorder. The fast path is model-free but not
     *  exclusion-free: most of what never reaches a founder is removed here. */
    log?: ExclusionLog;
    /** ── A LEAK CONTROL FOR REPLAY HARNESSES. Production never sets it. ────
     *
     *  `usedInField` is tier 1 of the row sort, above the entire score, and it
     *  is true for a channel when either this founder's OWN traced awards or
     *  their peers' awards used it. For a founder that is correct and is the
     *  point of the signal.
     *
     *  For a harness replaying a real company against the fund it actually
     *  won, the founder's own history CONTAINS THE ANSWER, and tier 1 is the
     *  most valuable place in the ordering to be handed one. `"withheld"`
     *  drops the founder's own channels and keeps their peers', which is
     *  exactly what production does for a founder who is not in the corpus —
     *  most startups. Identity, subsector, peers and the eligibility screen
     *  are untouched.
     *
     *  Default `"corpus"`, so nothing about the shipped path changes. See
     *  scripts/founderIntake.ts for why removing only the WON channel would be
     *  worse than either. */
    ownHistory?: "corpus" | "withheld";
  } = {},
): Promise<VerdictResult> {
  // A recorder always exists here, whether or not the caller wanted the funnel.
  // The withheld count is read back off it, and a founder being told how many
  // funds are missing cannot depend on whether the call site passed an
  // optional argument.
  const log = opts.log ?? new ExclusionLog();
  const selfRecord = matchCompany(company, country);
  const targetSub =
    selfRecord.matched && !isGenericSubsector(selfRecord.subsector) ? selfRecord.subsector : "";
  const dbPeers = targetSub
    ? findPeersBySubsector(targetSub, { country, limit: 4, exclude: [company] })
    : [];
  const fieldChannels = new Set<string>([
    ...(selfRecord.matched && opts.ownHistory !== "withheld" ? selfRecord.channels : []),
    ...dbPeers.flatMap((r) => r.channels),
  ]);
  const founderCountries = founderCountryList(country, opts.targetMarkets, eligibility?.entityCountries);
  // Semantic ranking on the FAST path, not just in the memo.
  //
  // This screen decides which funds a founder sees first, and it was ranking on
  // lexical keyword overlap while the memo ranked on embeddings. Measured across
  // the 12 archetypes: the two disagree on the top five for ALL TWELVE, mean
  // overlap 1.2 of 5. A founder's instant read and their memo were built from
  // different orderings of the same pool, and the instant one used the signal
  // documented as "measurably worse".
  //
  // Awaited alongside nothing else because it is one Voyage call with a 6s
  // timeout and a per-invocation memo; on failure or without VOYAGE_KEY it
  // returns an empty map and selectInstrumentRows falls back to the lexical
  // index exactly as before. The screen must never fail because a vector query
  // timed out.
  const semantic = await semanticFundMatch(opts.description ?? "");
  const candidates = await buildInstrumentTableHydrated({
    fieldChannels,
    founderCountries,
    capitalSought: opts.capitalSought ?? [],
    description: opts.description,
    semantic,
    // Everything the founder answered, mapped in ONE place shared with the
    // memo path below. Written out field by field here and field by field
    // there, the two copies drifted and the memo lost `founderSector` and
    // `useOfFunds`. See tableInputFromAnswers.
    ...tableInputFromAnswers(eligibility),
    openJudgements: opts.openJudgements,
    log,
  });
  // Phase two of hydration, on the FAST path too. computeVerdict is
  // model-free, not IO-free: its eligibility screen renders the source
  // citation for each rule, and without this every row came back with a blank
  // one — 0 of 25 on a live call. "Instant" means no model round-trip; one
  // scoped query for the seven instruments on the table is not what makes this
  // path slow, and a rule shown without its source is not evidence.
  // Gates are already in memory: buildInstrumentTableHydrated fetched them for
  // exactly these instruments between selecting and materialising them.
  const candidateIds = candidates
    .map((r) => r.instrumentId).filter((id): id is string => Boolean(id));
  return {
    eligibilityScreen: evaluateEligibility(eligibility, candidateIds),
    instrumentTable: candidates.slice(0, DISPLAY_CAP),
    selfMatched: selfRecord.matched,
    candidateInstrumentIds: candidateIds,
    withheld: withheldNotice(log.countsByRule()["SEL-UNCONFIRMED-OPEN"] ?? 0),
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
  // The comparable-company researcher gets the claims discipline and nothing
  // else. It does not rank, select or write a section, so the brief contracts
  // and the round-2 contract would be prompt it reads past on every request.
  const instructions = assembleInstructions("screen");

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
  // wsCD. The founder's prose answers to requirements no comparator can
  // decide, read against the verbatim text they were written from. One model
  // call, billed through recordUsage like every other. Returns [] with the arm
  // off, on any failure, and when nothing was answered in prose -- and an
  // empty list leaves the ranking bit-identical, so this cannot be the reason
  // a memo differs from the screen the founder just saw.
  const openJudgements = await judgeOpenAnswers(
    (req.projectAnswers ?? [])
      .filter((a) => a.openKey && a.quote && a.answer)
      .map((a) => ({
        key: a.openKey!,
        requirement: a.quote,
        answer: { key: a.openKey!, question: a.question, answer: a.answer },
      })),
    req.description,
  );
  const hydratedTable = await buildInstrumentTableHydrated({
    fieldChannels,
    founderCountries: founderCountryList(req.country, req.targetMarkets, req.eligibility?.entityCountries),
    capitalSought: req.capitalSought ?? [],
    description: req.description,
    semantic: semanticScores,
    openJudgements,
    // The memo ranks the same siblings the fast path does, so it must see the
    // same answers. It did not: this literal was maintained by hand alongside
    // the one in computeVerdict and had lost `founderSector` and `useOfFunds`,
    // so the memo ranked as if the founder had declined to say what they build
    // or what the money was for — two of the six questions on screen one.
    ...tableInputFromAnswers(req.eligibility),
    log,
  });
  // ── The cut comes AFTER the drop, which is what VERDICT_POOL always meant ──
  // A conclusively blocked fund is never published, so a blocked row holding a
  // pool seat publishes nothing. Slicing first spent the whole pool on rows
  // that were then deleted: a 250+ company against an SME-heavy national
  // register had twenty-two accessible funds, the first at rank 81, and every
  // one of the eighteen seats went to a scheme it could not use. The brief was
  // EMPTY. See accessiblePool for the property and the measurement.
  //
  // Strictly additive: for a founder with nothing blocked in the top of the
  // ranking this is the same eighteen rows in the same order, and no row that
  // reaches the founder today can stop reaching them.
  const accessible = accessiblePool(hydratedTable, req.eligibility, log);
  // ── wsDL: THE MODEL IN THE SELECTION SEAT, ON THE PATH THE MEMO TAKES ────
  //
  // wsDD placed this call in `computeVerdict`, which reorders the fast-path
  // table. Nothing downstream of a founder's brief reads that table: this
  // function rebuilds its own pool and hands it to `orderMemoCandidates`,
  // which sorts on verdict rank and breaks every tie on the pool's incoming
  // index. So the model's ranking was discarded before a word was written.
  // Here it is not: the order of this array IS the order inside each
  // qualification band, and that is what the writer is shown and what gets
  // published.
  //
  // AFTER the cut by default. This permutes `VERDICT_POOL` rows that were
  // already selected and already cleared; it cannot add, drop or re-gate one,
  // so the pool is the same SET it has always been and the pool metric cannot
  // move.
  //
  // ── wsDR: AND BEFORE THE CUT, BEHIND `AGENT_SELECT_SEAM=early` ──────────
  // wsDL called moving the seam earlier "the next measurement, not a silent
  // default", and wsDQ's first paid run is what made it due: the model reached
  // a mean depth of 13.6 of 17, i.e. to the bottom of what it was shown, while
  // the answer is in those eighteen rows only about a third of the time. Depth
  // was binding, not judgement. `early` hands it the whole accessible pool and
  // cuts to `VERDICT_POOL` AFTER, so the model chooses which rows hold a seat.
  //
  // The membership change is real and is the price. What replaces pool
  // invariance is stated in agentSelect.ts and measured in _wsdr_seam.ts:
  // `accessiblePool` runs before BOTH settings, so no row either can promote
  // has skipped a gate, and pool recall is reported on both arms of every run.
  //
  // ── wsEI: WHAT `early` ACTUALLY WIDENS, WHICH IS NOT THE POOL ───────────
  // Read the two expressions below as sets, not as depths. `agentSelectRows`
  // returns `[...chosen, ...everything else in the shipped order]` and `chosen`
  // is at most `SELECT_COUNT` rows, so the `early` pool is SELECT_COUNT rows
  // the model named plus the first `VERDICT_POOL - SELECT_COUNT` of the score's
  // own order. It is SIX SEATS SWAPPED, not a wider pool — and the menu those
  // six are drawn from is cut to `SELECT_DEPTH`, which was 40 against a median
  // accessible pool of 91.
  //
  // Both bounds bit in wsDR's run and neither was named as the lever under
  // test, which is why "the early seam admitted zero funds" reads as a verdict
  // on depth. It is not one. The early arm promoted 64 rows from below the
  // score's cut across 30 of 45 founders; none of the 64 happened to be a won
  // fund, and on the nine founders whose won fund was newly visible the rows
  // were unreadable (wsDV: 0 of 9 carried a `funds:` line, since repaired).
  //
  // So the three depths are three separate levers and a run that moves one
  // measures one: `AGENT_SELECT_DEPTH` is what the model SEES,
  // `AGENT_SELECT_COUNT` is how many seats it may FILL, `BRIEF_VERDICT_POOL` is
  // how many survive to the writer. Moving the seam alone moves none of them.
  //
  // Arm off (the default) returns `instrumentTable` by reference before any
  // work is done, so the shipped path is identical to the one that existed
  // before this call. `scripts/_wsdl_equiv.ts` asserts that rather than
  // asserting it in prose. The `early` branch is guarded on the arm being ON as
  // well as on the seam, so with the arm off there is exactly one expression
  // here and it is the one that has always run — a flag cannot move a row for a
  // founder whose request never calls a model.
  const signalled = (rows: InstrumentRow[]) =>
    applyProfileSignal(rows, req.profileSignal, req.companyType);
  const instrumentTable =
    agentSelectEnabled() && AGENT_SELECT_SEAM === "early"
      ? (await agentSelectMemoPool(signalled(accessible), req)).slice(0, VERDICT_POOL)
      : await agentSelectMemoPool(signalled(accessible.slice(0, VERDICT_POOL)), req);
  // FUND-1's other half. An empty table is never the answer while any door is
  // open -- and where none is, the brief has to SAY SO and say what would
  // change it. Silence is the only answer that is never acceptable, and
  // silence is what shipped. Code-authored and model-free, so it cannot fail
  // to appear because a writer call did.
  const noDoors = accessible.length === 0
    ? explainNoDoors(hydratedTable, req.eligibility)
    : undefined;

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
    req, records, intel, dbPeers, self, instrumentTable, instructions, sectorTop, emit, log,
    semanticScores);

  const { _dropped, ...report } = body;
  emit({
    type: "report",
    data: {
      company: req.company,
      generatedAt: new Date().toISOString(),
      ...report,
      // Code-authored and appended AFTER the writer's fields, so nothing the
      // model returns can overwrite, soften or omit it.
      withheld: withheldNotice(log.countsByRule()["SEL-UNCONFIRMED-OPEN"] ?? 0),
      // Appended after the writer's fields for the same reason `withheld` is:
      // nothing the model returns can overwrite, soften or omit it.
      noDoors,
      // Where each part came from, plus what was removed on the way. Always
      // emitted, rendered only under ?trace=1 — the cost is a few hundred
      // bytes and it is the difference between "why is this fund missing"
      // being answerable and not.
      provenance: buildProvenance(log.countsByRule()),
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
