/**
 * Two `npm run stages` reports, stage by stage, with the drift caveat printed.
 *
 * FREE and offline — reads two committed markdown reports. No DB, no network,
 * no model.
 *
 * A corpus write is global: there is no way to hold both arms of it in one run,
 * so this is a BEFORE/AFTER pair on two runs, not a paired within-run
 * comparison, and `rank_shape_wsGY.md` measured the shipped ordering drifting by
 * about three founders in two hours while workstreams republish
 * `instrument_profiles`. That is the noise floor for anything here, and it is
 * printed rather than left to the reader.
 *
 * @ws-active until 2026-09-30
 * Run: BEFORE=... AFTER=... npx tsx scripts/_wshf_funnel_diff.ts
 */
import { readFileSync } from "node:fs";

type Row = { stage: string; n: number; pct: number; hw: number };

function stages(md: string): Row[] {
  const out: Row[] = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*([\d.]+)%\s*\+\/-\s*([\d.]+)\s*\|/);
    if (m) out.push({ stage: m[1], n: +m[2], pct: +m[3], hw: +m[4] });
  }
  return out;
}

function fingerprint(md: string): string {
  return (md.match(/draw fingerprint\s+(\S+)/) ?? [])[1] ?? "(none)";
}
function ranker(md: string): string {
  return (md.match(/ranker: .*/) ?? [])[0] ?? "(no ranker attestation)";
}
function corpus(md: string): string {
  return (md.match(/^corpus\s+.*/m) ?? [])[0] ?? "(no corpus line)";
}

const before = readFileSync(process.env.BEFORE!, "utf8");
const after = readFileSync(process.env.AFTER!, "utf8");

for (const [label, md] of [["BEFORE", before], ["AFTER", after]] as const) {
  console.log(`${label}  ${corpus(md)}`);
  console.log(`        draw ${fingerprint(md)}   ${ranker(md)}`);
}
if (fingerprint(before) !== fingerprint(after)) {
  console.log("\n██ DIFFERENT DRAW FINGERPRINTS — these two runs measured different\n" +
              "   founders and no row below is a comparison.");
}

const b = stages(before);
const a = stages(after);
console.log("\n| stage | before | after | move |");
console.log("|---|---:|---:|---:|");
for (const r of b) {
  const m = a.find((x) => x.stage === r.stage);
  if (!m) {
    console.log(`| ${r.stage} | ${r.n} (${r.pct}%) | — | STAGE ABSENT AFTER |`);
    continue;
  }
  const d = m.pct - r.pct;
  const noise = Math.max(r.hw, m.hw);
  const verdict = Math.abs(d) < 1e-9
    ? "no change"
    : `${d > 0 ? "+" : ""}${d.toFixed(1)} pts (${m.n - r.n} founders)` +
      (Math.abs(d) < noise ? `, INSIDE the +/-${noise} noise` : "");
  console.log(`| ${r.stage} | ${r.n} (${r.pct}%) | ${m.n} (${m.pct}%) | ${verdict} |`);
}
