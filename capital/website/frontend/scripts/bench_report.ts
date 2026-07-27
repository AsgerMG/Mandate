/**
 * Scores every brief memo_bench has ever produced, so quality is MEASURED
 * rather than read.
 *
 * FREE — pure analysis of memo-bench/run-*.json, no model calls, no DB.
 *
 * Why this exists: the defects that actually reach a founder are invisible to
 * the deterministic checks. check_archetypes.ts said everything passed while
 * briefs were shipping three rows the founder could not act on, a fund the
 * memo itself argued against, and (once) no caveat at all. Those were caught
 * by hand, one memo at a time, which does not scale and does not tell you
 * whether the last change made things better or worse.
 *
 * Each defect below was a REAL bug found by reading output. Encoding them as
 * checks means the next regression shows up as a number, and the trend line
 * says whether a change helped.
 *
 * Run: npx tsx scripts/bench_report.ts            # latest run per archetype
 *      npx tsx scripts/bench_report.ts --trend    # every run, oldest first
 */
import { readFileSync, readdirSync } from "node:fs";

interface Institution {
  institution?: string; country?: string; verdict?: string;
  whyEligible?: string; nextStep?: string; blocker?: string; gatesChecked?: number;
}
interface Report {
  bottomLine?: string[]; institutions?: Institution[];
  positioning?: string; stateOfPlay?: string; caveats?: string;
}
interface Row {
  archetype: string; company: string; country: string; secs: number;
  error?: string | null; shape?: string[]; report?: Report | null;
  /** git SHA the run was produced by — absent on runs made before stamping. */
  code?: string;
}

const words = (s: unknown) => String(s ?? "").trim().split(/\s+/).filter(Boolean).length;

/** Copy that tells the founder to wait rather than move. Each of these was
 *  observed in a shipped brief: sennder's had three of five rows like this. */
const WATCH_ONLY = /\b(monitor|deprioriti[sz]e|informational|watch|wait for|only pursue if|act if|revisit|keep an eye)\b/i;

/** The template that fills in when the writer never wrote about a row. Three
 *  of Nortal's five rows read exactly this. */
const BOILERPLATE = /verify eligibility directly with the fund|review the fund's current call/i;

/** A row whose own justification argues against it — Nebius shipped "IPCEI
 *  Micro targets semiconductor value chains, not cloud infrastructure
 *  operators like Nebius".
 *
 *  Only counted on rows with NO blocker. A `one_blocker` row is SUPPOSED to
 *  name the thing in the way; that is the product working. A first, looser
 *  pattern flagged "it invests via VC funds, not directly" and "the
 *  technostarter seed track is not your entry point" — both correct rows with
 *  a real workaround in nextStep. A check that cries wolf on good output is
 *  worse than no check, because it trains you to ignore the report. */
const MISMATCH_PHRASE = /\b(targets|aimed at|reserved for|designed for|focus(?:es|ed)? on)\b[^.]{0,80}\bnot\b/i;

interface Scored {
  archetype: string; company: string; secs: number; error?: string | null;
  code?: string;
  rows: number; actionable: number; watchOnly: number;
  boilerplate: number; contradictions: number;
  blockersExplained: number; blockersTotal: number;
  euRows: number; nationalRows: number;
  longestBullet: number; bodyWords: number; noCaveat: boolean;
  defects: string[];
}

function score(r: Row): Scored {
  const rep = r.report ?? {};
  const inst = rep.institutions ?? [];
  const defects: string[] = [];

  const watch = inst.filter((i) => WATCH_ONLY.test(String(i.nextStep ?? "")));
  const boiler = inst.filter((i) =>
    BOILERPLATE.test(String(i.whyEligible ?? "")) || BOILERPLATE.test(String(i.nextStep ?? "")));
  const contra = inst.filter((i) =>
    i.verdict !== "one_blocker" && MISMATCH_PHRASE.test(String(i.whyEligible ?? "")));
  const withBlocker = inst.filter((i) => i.verdict === "one_blocker");
  const explained = withBlocker.filter((i) => String(i.blocker ?? "").trim().length > 0);
  const bullets = rep.bottomLine ?? [];
  const longest = Math.max(0, ...bullets.map(words));
  const body = words(bullets.join(" ")) + words(rep.positioning) + words(rep.stateOfPlay);
  const noCaveat = !String(rep.caveats ?? "").trim();

  // Ordered by how badly each one hurts a founder reading the brief.
  if (r.error) defects.push("FAILED");
  else {
    if (contra.length) defects.push(`${contra.length} self-contradicting`);
    if (boiler.length) defects.push(`${boiler.length} boilerplate`);
    if (noCaveat) defects.push("no caveat");
    if (withBlocker.length > explained.length)
      defects.push(`${withBlocker.length - explained.length} blocker unexplained`);
    if (watch.length > 1) defects.push(`${watch.length} watch-only`);
    if (inst.length < 2) defects.push("under 2 rows");
    if (inst.length > 5) defects.push("over 5 rows");
    if (longest > 25) defects.push(`bullet ${longest}w`);
    if (body > 700) defects.push(`body ${body}w`);
  }

  return {
    archetype: r.archetype, company: r.company, secs: r.secs, error: r.error, code: r.code,
    rows: inst.length, actionable: inst.length - watch.length, watchOnly: watch.length,
    boilerplate: boiler.length, contradictions: contra.length,
    blockersExplained: explained.length, blockersTotal: withBlocker.length,
    euRows: inst.filter((i) => !i.country || i.country === "EU").length,
    nationalRows: inst.filter((i) => i.country && i.country !== "EU").length,
    longestBullet: longest, bodyWords: body, noCaveat, defects,
  };
}

function main() {
  const trend = process.argv.includes("--trend");
  const files = readdirSync("memo-bench").filter((f) => f.startsWith("run-")).sort();
  if (!files.length) return console.log("no runs in memo-bench/");

  // One entry per archetype (the newest), unless --trend wants the history.
  const latest = new Map<string, { at: number; row: Row }>();
  const all: { at: number; row: Row }[] = [];
  for (const f of files) {
    const at = Number(f.replace(/\D/g, ""));
    for (const row of JSON.parse(readFileSync(`memo-bench/${f}`, "utf8")) as Row[]) {
      all.push({ at, row });
      const prev = latest.get(row.archetype);
      if (!prev || at > prev.at) latest.set(row.archetype, { at, row });
    }
  }

  const set = trend ? all : [...latest.values()].sort((a, b) => a.row.archetype.localeCompare(b.row.archetype));
  const scores = set.map((x) => score(x.row));

  console.log(
    "archetype".padEnd(28) + "rows  act  nat/eu  blk  s    code      defects",
  );
  console.log("-".repeat(100));
  for (const s of scores) {
    console.log(
      s.archetype.slice(0, 27).padEnd(28) +
      String(s.rows).padEnd(6) +
      String(s.actionable).padEnd(5) +
      `${s.nationalRows}/${s.euRows}`.padEnd(8) +
      `${s.blockersExplained}/${s.blockersTotal}`.padEnd(5) +
      String(s.secs).padEnd(5) +
      (s.code ?? "pre-stamp").padEnd(10) +
      (s.defects.length ? s.defects.join(", ") : "clean"),
    );
  }

  const n = scores.length;
  const clean = scores.filter((s) => !s.defects.length).length;
  const sum = (f: (s: Scored) => number) => scores.reduce((a, s) => a + f(s), 0);
  console.log("-".repeat(100));
  console.log(`${clean}/${n} briefs clean`);
  console.log(
    `rows/brief ${(sum((s) => s.rows) / n).toFixed(1)}  ` +
    `actionable ${((sum((s) => s.actionable) / Math.max(1, sum((s) => s.rows))) * 100).toFixed(0)}%  ` +
    `national ${((sum((s) => s.nationalRows) / Math.max(1, sum((s) => s.rows))) * 100).toFixed(0)}%  ` +
    `blockers explained ${sum((s) => s.blockersExplained)}/${sum((s) => s.blockersTotal)}  ` +
    `median ${scores.map((s) => s.secs).sort((a, b) => a - b)[Math.floor(n / 2)]}s`,
  );

  // Rank the defect types by how many briefs they touch — that is the queue.
  const byDefect = new Map<string, number>();
  for (const s of scores) {
    for (const d of s.defects) {
      const key = d.replace(/^\d+\s*/, "").replace(/\d+w$/, "too long");
      byDefect.set(key, (byDefect.get(key) ?? 0) + 1);
    }
  }
  if (byDefect.size) {
    console.log("\nwhat to fix next (briefs affected):");
    for (const [d, c] of [...byDefect.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(c).padStart(2)}  ${d}`);
    }
  }
}

main();
