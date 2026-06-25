// Server-side corpus access for the intelligence agent: loads the company index
// and the fund-process briefs from disk, caches them across warm invocations,
// and fuzzy-matches competitor names against the corpus.
import { readFileSync } from "fs";
import path from "path";
import type { CompetitorRecord } from "./types";

// Index row layout (positional, written by scripts/build_companies_index.py):
//   0 name, 1 normalized-name(s), 2 country, 3 sector, 4 totalEur, 5 channels[]
type IndexRow = [string, string, string, string, number, string[]];

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

/** The shared agent-instructions brief, injected into every stage. */
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
 */
export function matchCompany(name: string): CompetitorRecord {
  const q = normalize(name);
  const unmatched: CompetitorRecord = {
    name,
    country: "",
    sector: "",
    euCapitalEur: 0,
    channels: [],
    matched: false,
  };
  if (!q) return unmatched;

  const qTokens = q.split(" ").filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
  const qSet = new Set(qTokens);
  const { rows } = loadIndex();

  let best: IndexRow | null = null;
  let bestScore = 0;
  for (const row of rows) {
    const rq = row[1];
    // Rows whose names are non-Latin normalize to an empty/tiny string and are
    // unmatchable by a Latin query — skip them outright.
    if (rq.length < 3) continue;
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
        }
        // else: a lone generic token ("Alice") sitting inside a larger name
        // ("Alice & Bob") is too weak to trust — leave score 0.
      } else if (qSet.size >= 2) {
        score = (overlap / qSet.size) * 0.5; // partial multi-token: stays sub-threshold
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = row;
      if (score === 1) break;
    }
  }

  if (!best || bestScore < 0.6) return unmatched;
  return {
    name: best[0],
    country: best[2],
    sector: best[3],
    euCapitalEur: best[4],
    channels: best[5],
    matched: true,
  };
}
