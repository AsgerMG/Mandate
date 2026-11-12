// The local bench app (/bench): what the server route streams to the page, and
// the small pieces of reading both sides share. Pure: no node imports, so the
// client page can use it (check_client_boundary).

/** One line of the NDJSON stream /api/bench/chat sends. */
export type BenchEvent =
  | { t: "session"; id: string }
  | { t: "activity"; label: string; kind: "thinking" | "researching" | "reading" | "writing" }
  | { t: "text"; d: string }
  | { t: "cites"; items: Record<string, Citation> }
  | { t: "source"; url: string; label: string }
  | { t: "saved"; path: string; ledger: string | null }
  | { t: "done"; error?: string };

export type Citation = { quote?: string; label?: string; url?: string };

/** Who may run the bench: local development, explicitly switched on. Read on
 *  the server only (the page and the route both call it). */
export function benchEnabled(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV === "development" && env.MANDATE_BENCH_LOCAL === "1" && !env.VERCEL;
}

const COUNTRY: Record<string, string> = {
  IT: "Italy", DE: "Germany", FR: "France", ES: "Spain", NL: "the Netherlands", BE: "Belgium",
  AT: "Austria", PL: "Poland", DK: "Denmark", SE: "Sweden", FI: "Finland", IE: "Ireland",
  PT: "Portugal", EU: "EU",
};
const where = (args: Record<string, unknown>): string => {
  const j = args.country ?? (Array.isArray(args.jurisdictions) ? args.jurisdictions[0] : args.jurisdiction);
  if (typeof j !== "string" || !j) return "";
  const name = COUNTRY[j.toUpperCase()] ?? j;
  return name === "EU" ? "EU " : `${name}'s `;
};

/** A one-line, plain-words hint for a brain_tool call. */
export function brainToolHint(tool: string, args: Record<string, unknown>): BenchEvent & { t: "activity" } {
  const w = where(args);
  const map: Record<string, [string, "researching" | "reading"]> = {
    find_instruments: [`searching ${w}public-capital instruments`, "researching"],
    match_status: [`checking ${w}status rules`, "reading"],
    assess_instrument: ["assessing an instrument against the case", "researching"],
    fund_requirements: ["reading a fund's requirements", "reading"],
    application_route: ["tracing how to apply", "researching"],
    find_precedents: ["looking for comparable deals", "researching"],
    profile_get: ["reviewing the company profile", "reading"],
    search_law: [`reading ${w}rules`, "reading"],
    document: ["reading a legal text", "reading"],
    consultations: ["checking open consultations", "researching"],
    actors: ["finding who holds the file", "researching"],
    ground_source: ["recording an official source", "reading"],
  };
  const [label, kind] = map[tool] ?? ["checking the record", "researching"];
  return { t: "activity", label, kind };
}

export type Landed = { decisions: string[]; flags: string[]; steps: string[]; question: string | null };

// A heading may name its section anywhere ("Your decisions", "Flags and gaps");
// a bold lead-in inside prose only counts when it STARTS with the word
// ("**Flag:** ...", "**Next step:** ..."), so "**Germany: no route today.**" is
// prose, not a decision.
const SECTIONS: [keyof Omit<Landed, "question">, RegExp][] = [
  ["decisions", /\b(decisions?|decide|recommend(ation)?s?|options?|routes?)\b/i],
  ["flags", /\b(flags?|risks?|deal.?breakers?|blockers?|gaps?|watch(es)?)\b/i],
  ["steps", /\b(next steps?|actions?|plan|to do)\b/i],
];
const LEAD_INS: [keyof Omit<Landed, "question">, RegExp][] = [
  ["decisions", /^(decisions?|decide|(my )?recommendation)\b/i],
  ["flags", /^(flags?|risks?|deal.?breakers?|blockers?)\b/i],
  ["steps", /^(next steps?|actions?)\b/i],
];
const clean = (s: string) =>
  s.replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();

/** What a reply has settled, read from its own structure: bullets under a
 *  heading (or bold lead-in) that names decisions, flags or next steps, and
 *  bold-labelled lines ("**Flag:** ..."). The closing question is the last line
 *  that ends in "?". Anything it cannot place it leaves out: the panel shows
 *  only what the text actually says. */
export function parseLanded(text: string): Landed {
  const out: Landed = { decisions: [], flags: [], steps: [], question: null };
  let current: keyof Omit<Landed, "question"> | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^(#{1,6}\s+(.*)|\*\*([^*]{2,60})\*\*:?\s*$)/);
    if (heading) {
      const title = heading[2] ?? heading[3] ?? "";
      current = SECTIONS.find(([, re]) => re.test(title))?.[0] ?? null;
      continue;
    }
    const labelled = line.match(/^(?:[-*]\s+)?\*\*([^*]{2,40}?):?\*\*:?\s*(.+)$/);
    if (labelled) {
      const hit = LEAD_INS.find(([, re]) => re.test(labelled[1].trim()));
      if (hit) { out[hit[0]].push(clean(labelled[2])); continue; }
    }
    const bullet = line.match(/^(?:[-*]|\d+[.)])\s+(.+)$/);
    if (bullet && current) out[current].push(clean(bullet[1]));
    else if (!bullet) current = current && /:$/.test(line) ? current : null;
  }
  const qs = text.split("\n").map((l) => l.trim()).filter((l) => /\?\**$/.test(l));
  if (qs.length) out.question = clean(qs[qs.length - 1].replace(/^(?:[-*]|\d+[.)])\s+/, ""));
  return out;
}

/** "[c1]", "[w2]" and "[c1, c4]" in a reply, as separate ids. */
export const CITE_RE = /\[((?:[cw]\d+)(?:\s*[,;]\s*[cw]\d+)*)\]/g;

/** Web sources as the reply lists them ("[w1] Title, https://..."), so a chip
 *  can show where a [wN] came from. */
export function parseWebSources(text: string): Record<string, Citation> {
  const out: Record<string, Citation> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/\[(w\d+)\][:\s]*(.*)$/);
    if (!m || out[m[1]]) continue;
    const link = m[2].match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
    const url = link?.[2] ?? m[2].match(/https?:\/\/[^\s)>\]]+/)?.[0];
    if (!url) continue;
    const quote = m[2].match(/["“]([^"”]{8,})["”]/)?.[1];
    const label = link?.[1]
      ?? (clean(m[2].replace(url, "").replace(/["“][^"”]*["”]/, "").replace(/[\s,;:()<>-]+$/, "")) || url);
    out[m[1]] = { url, label, quote };
  }
  return out;
}
