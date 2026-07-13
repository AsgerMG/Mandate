// Server-side corpus access for the intelligence agent: loads the company index
// and the fund-process briefs from disk, caches them across warm invocations,
// and fuzzy-matches competitor names against the corpus.
import { readFileSync } from "fs";
import path from "path";
import type { CompetitorRecord, FundSnapshot } from "./types";

// Country name (as the web search returns it) → ISO2, to disambiguate matches.
// Only the European countries in scope; anything else stays undefined and the
// match falls back to name-only scoring.
const COUNTRY_ISO: Record<string, string> = {
  austria: "AT", belgium: "BE", bulgaria: "BG", croatia: "HR", cyprus: "CY",
  czechia: "CZ", "czech republic": "CZ", denmark: "DK", estonia: "EE",
  finland: "FI", france: "FR", germany: "DE", greece: "GR", hungary: "HU",
  iceland: "IS", ireland: "IE", italy: "IT", latvia: "LV", lithuania: "LT",
  luxembourg: "LU", malta: "MT", netherlands: "NL", "the netherlands": "NL",
  norway: "NO", poland: "PL", portugal: "PT", romania: "RO", slovakia: "SK",
  slovenia: "SI", spain: "ES", sweden: "SE", switzerland: "CH",
  "united kingdom": "GB", uk: "GB", "great britain": "GB", britain: "GB",
};

function toIso2(country?: string): string {
  if (!country) return "";
  const c = country.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(c)) return c.toUpperCase();
  return COUNTRY_ISO[c] ?? "";
}

// Index row layout (positional, written by website/build/companies_index.py):
//   0 name, 1 normalized-name(s), 2 country, 3 sector, 4 totalEur,
//   5 per-channel EUR [[channel, eur], ...] (desc), 6 firstYear, 7 lastYear,
//   8 sector_top, 9 subsector (two-tier taxonomy; drive DB-native peer discovery),
//   10 entity_type (keep research orgs / public bodies out of peer lists)
type IndexRow = [
  string, string, string, string, number, [string, number][], number, number,
  string, string, string,
];

interface IndexFile {
  generatedAt: string;
  companies: number;
  rows: IndexRow[];
}

// Legal-form / connective tokens that should not drive a name match on their own.
const STOP_TOKENS = new Set([
  "gmbh", "ag", "ug", "sa", "sas", "sarl", "srl", "spa", "ltd", "limited",
  "plc", "llc", "inc", "corp", "co", "company", "bv", "nv", "oy", "ab", "as",
  "aps", "se", "the", "and", "of", "group", "holding", "holdings",
  "international", "technologies", "technology", "labs", "systems", "solutions",
]);

let indexCache: IndexFile | null = null;
const fundCache = new Map<string, string>();
let instructionsCache: string | null = null;

function normalize(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadIndex(): IndexFile {
  if (!indexCache) {
    const file = path.join(process.cwd(), "public", "data", "companies_index.json");
    indexCache = JSON.parse(readFileSync(file, "utf8")) as IndexFile;
  }
  return indexCache;
}

/** Read one fund-process brief by channel code, or "" if none exists. */
export function loadFundProcess(channel: string): string {
  if (!fundCache.has(channel)) {
    try {
      const file = path.join(process.cwd(), "fund-processes", `${channel}.md`);
      fundCache.set(channel, readFileSync(file, "utf8"));
    } catch {
      fundCache.set(channel, "");
    }
  }
  return fundCache.get(channel) ?? "";
}

const snapshotCache = new Map<string, FundSnapshot | null>();

/**
 * Parse the `## At a glance` block of a fund brief into structured trade-off
 * fields. This is the only source for the instrument-comparison table: the
 * figures are curated in the brief, never written by the model, so the table
 * cannot be fabricated. Returns null when a brief has no snapshot block.
 */
export function loadFundSnapshot(channel: string): FundSnapshot | null {
  if (!snapshotCache.has(channel)) {
    snapshotCache.set(channel, parseSnapshot(loadFundProcess(channel)));
  }
  return snapshotCache.get(channel) ?? null;
}

function parseSnapshot(md: string): FundSnapshot | null {
  const idx = md.indexOf("## At a glance");
  if (idx === -1) return null;
  // Read only to the next heading so a later section can't leak in.
  const next = md.indexOf("\n## ", idx + 1);
  const block = md.slice(idx, next === -1 ? undefined : next);
  const field = (key: string): string => {
    const m = block.match(new RegExp(`^- ${key}:\\s*(.+)$`, "m"));
    return m ? m[1].trim() : "";
  };
  const ticket = field("Ticket");
  if (!ticket) return null;
  return {
    ticket,
    speed: field("Speed"),
    giveUp: field("You give up"),
    bestFor: field("Best for"),
  };
}

/** The shared agent-instructions brief, injected into every stage. */
export interface DigestItem {
  title: string;
  source: string;
  tier: string;
  date: string | null;
  url: string;
  excerpt: string;
  similarity: number;
}

interface SignalsDigest {
  generatedAt: string;
  topics: Record<string, DigestItem[]>;
  sectors: Record<string, DigestItem[]>;
}

let digestCache: SignalsDigest | null | undefined;

/** The build-time export of the public-capital-intelligence corpus
 *  (website/build/signals_digest.py). null = not generated yet — the brief
 *  then simply omits the landscape grounding rather than failing. */
export function loadSignalsDigest(): SignalsDigest | null {
  if (digestCache === undefined) {
    try {
      const file = path.join(process.cwd(), "public", "data", "signals_digest.json");
      digestCache = JSON.parse(readFileSync(file, "utf8")) as SignalsDigest;
    } catch {
      digestCache = null;
    }
  }
  return digestCache;
}

export function loadAgentInstructions(): string {
  if (instructionsCache === null) {
    try {
      const file = path.join(process.cwd(), "fund-processes", "_agent_instructions.md");
      instructionsCache = readFileSync(file, "utf8");
    } catch {
      instructionsCache = "";
    }
  }
  return instructionsCache;
}

/**
 * Fuzzy-match one company name against the corpus. Returns a record either way:
 * `matched: false` with zeroed funding when the name is not found, so callers
 * can faithfully report "no public funding traced" rather than implying zero.
 *
 * An optional `countryHint` (web-researched, any spelling or ISO2) raises recall
 * safely: it lets a single distinctive token resolve to one entity in that
 * country instead of being rejected as ambiguous, and breaks ties between
 * equally-scored homonyms in different countries.
 */
export function matchCompany(name: string, countryHint?: string): CompetitorRecord {
  const q = normalize(name);
  const unmatched: CompetitorRecord = {
    name,
    country: "",
    sector: "",
    sectorTop: "",
    subsector: "",
    euCapitalEur: 0,
    channels: [],
    channelAmounts: [],
    firstYear: 0,
    lastYear: 0,
    matched: false,
  };
  if (!q) return unmatched;

  const iso = toIso2(countryHint);
  const qTokens = q.split(" ").filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
  const qSet = new Set(qTokens);
  const { rows } = loadIndex();

  // A lone short token ("GMV", "EOS") is an acronym: an exact name hit on it is
  // almost worthless without corroboration, because dozens of unrelated entities
  // share three letters across the corpus.
  const acronym = qSet.size === 1 && qTokens[0].length <= 3;

  let best: IndexRow | null = null;
  let bestScore = 0;
  for (const row of rows) {
    const rq = row[1];
    // Rows whose names are non-Latin normalize to an empty/tiny string and are
    // unmatchable by a Latin query — skip them outright.
    if (rq.length < 3) continue;
    const sameCountry = iso !== "" && row[2] === iso;
    const countryConflict = iso !== "" && row[2] !== "" && row[2] !== iso;
    let score = 0;
    if (rq === q) {
      score = 1;
    } else if (qSet.size) {
      // Token-boundary matching only — never raw substring. Substring matching
      // produced dangerous false positives ("Futura" -> "Futurasun",
      // "PyxiScience" -> "ENCE", "Alice" -> "Alice & Bob") which then attributed
      // an unrelated company's public funding. Bias hard towards precision: a
      // wrong match is worse than a miss, so prefer "no public funding traced".
      const rqTokens = rq
        .split(" ")
        .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
      const rqSet = new Set(rqTokens);
      let overlap = 0;
      for (const t of qSet) if (rqSet.has(t)) overlap++;
      const extra = rqSet.size - overlap; // corpus tokens absent from the query
      if (overlap === qSet.size) {
        // Every query token is present as a whole token in the corpus name.
        if (qSet.size >= 2) {
          score = 0.9 - 0.05 * extra; // multi-token name: confident
        } else if (extra === 0) {
          score = 0.9; // single-token query, and the corpus name is just that token
        } else {
          // A lone token ("Vyoma") sitting inside a larger corpus name
          // ("Vyoma Space GmbH"). Trust it only when the web-researched country
          // pins it to this entity, or the token is very distinctive (long).
          const t = qTokens[0];
          if (sameCountry && t.length >= 5) score = 0.8 - 0.02 * extra;
          else if (t.length >= 8) score = 0.75 - 0.02 * extra;
        }
      } else if (qSet.size >= 2) {
        score = (overlap / qSet.size) * 0.5; // partial multi-token: stays sub-threshold
      }
    }
    // Country guards. A web-researched country that contradicts the corpus row
    // means we matched the wrong entity — kill a single-token match outright
    // (a multinational's multi-token name can legitimately sit in another
    // country, so only the ambiguous single-token case is killed). An acronym
    // is trusted only when the country actively confirms it.
    if (countryConflict && qSet.size === 1) score = 0;
    if (acronym && !sameCountry) score = 0;
    // Nudge a country-confirmed row above an equally-scored homonym elsewhere.
    if (score > 0 && sameCountry) score += 0.03;
    if (score > bestScore) {
      bestScore = score;
      best = row;
      if (score >= 1) break;
    }
  }

  if (!best || bestScore < 0.6) return unmatched;
  return {
    name: best[0],
    country: best[2],
    sector: best[3],
    sectorTop: best[8] ?? "",
    subsector: best[9] ?? "",
    euCapitalEur: best[4],
    channels: best[5].map(([c]) => c),
    channelAmounts: best[5].map(([channel, eur]) => ({ channel, eur })),
    firstYear: best[6],
    lastYear: best[7],
    matched: true,
  };
}

/**
 * Catch-all taxonomy buckets ("other", "software_general", "industrial_general",
 * etc.) hold tens of thousands of unrelated companies. The most-funded names in
 * them are giant state-aid recipients with no real relation to the founder, so
 * "peers" drawn from them destroy the memo's credibility (a €370M chip fab as a
 * space-startup peer). Treat these buckets as "no meaningful peers".
 */
export function isGenericSubsector(subsector: string): boolean {
  const s = subsector.trim().toLowerCase();
  return s === "" || s === "other" || s === "general" || s === "unclassified" ||
    s.endsWith("_general");
}

/**
 * Database-native peer discovery. Given a sub-sector (and optionally a country to
 * prefer), return the most-funded corpus companies in that bucket — guaranteed to
 * carry a real public-funding signal, unlike web-found names that may not match.
 * Excludes any names in `exclude` (the founder + web peers already gathered).
 * Returns none for catch-all buckets, where "peers" would be unrelated giants.
 */
export function findPeersBySubsector(
  subsector: string,
  opts: { country?: string; limit?: number; exclude?: string[] } = {},
): CompetitorRecord[] {
  if (!subsector || isGenericSubsector(subsector)) return [];
  const { rows } = loadIndex();
  const iso = toIso2(opts.country);
  const limit = opts.limit ?? 5;
  const skip = new Set((opts.exclude ?? []).map((n) => normalize(n)));

  // Universities / institutes are not peers. entity_type catches the labelled
  // ones; the name pattern catches unmerged sisters still typed "unknown"
  // (e.g. "NORCE RESEARCH" sitting next to the labelled "Norwegian Research
  // Centre" row — surfaced by the Cenotian test memo).
  const RESEARCH_NAME =
    /\b(RESEARCH|UNIVERSIT|INSTITUT|FRAUNHOFER|CNRS|LABORATOR|ACADEM|HOCHSCHULE|POLYTECH)\w*\b/i;
  const hits = rows.filter(
    (r) =>
      r[9] === subsector &&
      r[4] > 0 &&
      r[10] !== "research_org" &&
      !(r[10] !== "company" && RESEARCH_NAME.test(r[0])) &&
      !skip.has(normalize(r[0])),
  );
  // Prefer same-country peers, then rank by traced public capital (desc).
  hits.sort((a, b) => {
    if (iso) {
      const ac = a[2] === iso ? 1 : 0;
      const bc = b[2] === iso ? 1 : 0;
      if (ac !== bc) return bc - ac;
    }
    return b[4] - a[4];
  });
  return hits.slice(0, limit).map((r) => ({
    name: r[0],
    country: r[2],
    sector: r[3],
    sectorTop: r[8] ?? "",
    subsector: r[9] ?? "",
    euCapitalEur: r[4],
    channels: r[5].map(([c]) => c),
    channelAmounts: r[5].map(([channel, eur]) => ({ channel, eur })),
    firstYear: r[6],
    lastYear: r[7],
    matched: true,
  }));
}
