import { readFileSync, writeFileSync } from "fs";
import path from "path";
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.VOYAGE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "voyage-3.5", input: texts, input_type: "query" }),
  });
  const j: any = await res.json();
  if (!j.data) throw new Error(JSON.stringify(j).slice(0, 300));
  return j.data.map((d: any) => d.embedding);
}
async function main() {
  const set = JSON.parse(readFileSync(path.join(process.cwd(), "lib", "intelligence",
    "__recallSetPlus.json"), "utf8")) as any[];
  const rows = set.filter((r) => r.split === "holdout");
  const N = Number(process.env.N ?? 300);
  const step = Math.max(1, Math.floor(rows.length / N));
  const sample = rows.filter((_, i) => i % step === 0).slice(0, N);
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const out: any[] = [];
  const seen = new Map<string, number[]>();
  for (let i = 0; i < sample.length; i += 32) {
    const batch = sample.slice(i, i + 32);
    const texts = batch.map((t) => t.description || t.selfDescription || "");
    const fresh = [...new Set(texts.filter((t) => t && !seen.has(t)))];
    if (fresh.length) {
      const vecs = await embed(fresh);
      for (let k = 0; k < fresh.length; k++) {
        const r = await client.query(
          `SELECT 1 - (embedding <=> $1::vector) AS s FROM instrument_profiles ORDER BY embedding <=> $1::vector`,
          [`[${vecs[k].join(",")}]`]);
        seen.set(fresh[k], r.rows.map((x: any) => Number(x.s)));
      }
    }
    for (const t of batch) {
      const text = t.description || t.selfDescription || "";
      const sims = seen.get(text);
      if (sims) out.push({ real: Boolean(t.description), len: text.length, sims });
    }
    process.stderr.write(`${out.length}/${sample.length}\r`);
  }
  await client.end();
  writeFileSync("scripts/.tmp/raw.json", JSON.stringify(out));
  console.log(`\nwrote ${out.length} rows, ${seen.size} distinct queries`);
}
main();
