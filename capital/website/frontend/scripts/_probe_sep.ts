// Throwaway probe: do RAW cosine similarities separate a real project
// description from a canned sector template? Percentile normalisation destroys
// the answer, so ask the index directly.
import { readFileSync } from "fs";
import path from "path";
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* env */ }

async function embed(text: string): Promise<number[] | null> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.VOYAGE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ input: [text], model: "voyage-3.5", input_type: "query" }),
  });
  if (!res.ok) { console.error(res.status, await res.text()); return null; }
  return (await res.json() as any).data?.[0]?.embedding ?? null;
}

function stats(s: number[]) {
  const n = s.length;
  const mean = s.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const sorted = [...s].sort((a, b) => b - a);
  const max = sorted[0];
  const top10 = sorted.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  return {
    max, mean, sd,
    spread: max / mean - 1,
    zmax: (max - mean) / sd,
    ztop10: (top10 - mean) / sd,
    // Fraction of the corpus within 90% of the best match's *excess* over mean.
    tail: s.filter((v) => v > mean + 0.5 * (max - mean)).length / n,
  };
}

async function main() {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const all = JSON.parse(readFileSync(
    path.join(process.cwd(), "lib", "intelligence", "__recallSet.json"), "utf8")) as any[];
  const canned = [...new Set(all.map((r) => r.selfDescription).filter(Boolean))] as string[];
  const real = [...new Set(all.filter((r) => r.mode === "project" && r.description)
    .map((r) => r.description) as string[])].filter((_, i) => i % 5 === 0).slice(0, 55);

  const rows: [string, string, ReturnType<typeof stats>][] = [];
  for (const [label, list] of [["CANNED", canned], ["REAL", real]] as const) {
    for (const d of list) {
      const vec = await embed(d);
      if (!vec) continue;
      const res = await client.query(
        `SELECT 1 - (embedding <=> $1::vector) AS s FROM instrument_profiles`,
        [`[${vec.join(",")}]`]);
      rows.push([label, d, stats(res.rows.map((r: any) => Number(r.s)))]);
    }
  }
  await client.end();

  const keys = ["max", "mean", "sd", "spread", "zmax", "ztop10", "tail"] as const;
  console.log("\n-- separation (higher |t| = better discriminator) --");
  for (const k of keys) {
    const a = rows.filter((r) => r[0] === "CANNED").map((r) => r[2][k]);
    const b = rows.filter((r) => r[0] === "REAL").map((r) => r[2][k]);
    const m = (x: number[]) => x.reduce((p, q) => p + q, 0) / x.length;
    const v = (x: number[]) => x.reduce((p, q) => p + (q - m(x)) ** 2, 0) / (x.length - 1);
    const t = (m(b) - m(a)) / Math.sqrt(v(a) / a.length + v(b) / b.length);
    // Best single threshold and the accuracy it achieves.
    const cand = [...a, ...b].sort((x, y) => x - y);
    let best = { acc: 0, thr: 0 };
    for (const c of cand) {
      const acc = (a.filter((x) => x < c).length + b.filter((x) => x >= c).length) / (a.length + b.length);
      if (acc > best.acc) best = { acc, thr: c };
    }
    console.log(`${k.padEnd(8)} canned ${m(a).toFixed(4)}  real ${m(b).toFixed(4)}  t=${t.toFixed(2)}  best split acc=${(100 * best.acc).toFixed(0)}% at ${best.thr.toFixed(4)}`);
  }

  // Cost-weighted: calling a REAL description canned sends a founder who wrote
  // one to the flat peer branch, which the audit measures at -15 points for
  // them; calling a canned one specific costs the other population ~6. Weight
  // the errors by that, and by the 16/84 population split.
  const P_REAL = 0.16, C_REAL_ERR = 26, C_CANNED_ERR = 6;
  console.log("\n-- expected cost at each threshold on `spread` (lower better) --");
  const A = rows.filter((r) => r[0] === "CANNED").map((r) => r[2].spread);
  const B = rows.filter((r) => r[0] === "REAL").map((r) => r[2].spread);
  for (const t of [0.25, 0.28, 0.30, 0.32, 0.35, 0.38, 0.40, 0.45]) {
    const missReal = B.filter((x) => x < t).length / B.length;
    const missCanned = A.filter((x) => x >= t).length / A.length;
    const cost = P_REAL * missReal * C_REAL_ERR + (1 - P_REAL) * missCanned * C_CANNED_ERR;
    console.log(`  t=${t.toFixed(2)}  real->canned ${(100 * missReal).toFixed(0)}%  `
      + `canned->real ${(100 * missCanned).toFixed(0)}%  expected cost ${cost.toFixed(2)}`);
  }
  console.log(`\n(n: canned=${A.length} real=${B.length})`);
}
main();
