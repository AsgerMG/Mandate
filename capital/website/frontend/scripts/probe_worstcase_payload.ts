// Worst-case per-request payload as a function of POOL_LEAVES_PER_CHANNEL.
//
// Phase one is cap-independent. Phase two is not: `hydrateGatesFor` fetches the
// gate rows for every leaf the pool admits plus the regime each inherits from,
// and the pool is what the cap governs. So the cap-sensitive cost is
//
//   max over founder countries C of
//     sum over channels of  own gates of min(cap, leaves serving C in channel)
//     plus the gates of every distinct parent those leaves inherit from
//
// An upper bound on purpose: it ignores the capital and ticket filters and the
// name dedupe, all of which only ever REMOVE rows. A budget wants the bound.
import { readFileSync, statSync } from "node:fs";

const FILE = "public/data/instrument_terms.json";

interface Rec {
  id: string; parentId?: string | null; country: string; isFramework?: boolean;
  sourceFamilyBucket?: string | null; gates?: unknown[];
}

async function main() {
  // Same determinism contract as check_leaf_cap: the committed snapshot, whose
  // agreement with Postgres check_corpus_currency asserts separately.
  delete process.env.DATABASE_URL;
  const { publishableInstruments } = await import("../lib/intelligence/corpus");
  const { POOL_LEAVES_PER_CHANNEL } = await import("../lib/intelligence/shortlist");

  const raw = JSON.parse(readFileSync(FILE, "utf8")) as { records: Rec[] };
  // OWN gates, from the file. corpus.ts merges a parent's gates into every
  // child at load; counting the merged copy would bill one regime's gates once
  // per sibling, where the query returns each row exactly once.
  const ownBytes = new Map<string, number>();
  for (const r of raw.records) {
    ownBytes.set(r.id, (r.gates ?? []).reduce((n, g) => n + JSON.stringify(g).length + 1, 0));
  }
  const byId = new Map(raw.records.map((r) => [r.id, r]));

  const pub = publishableInstruments();
  const countries = [...new Set(pub.map((i) => i.country).filter((c) => c && c !== "EU"))];

  const fileBytes = statSync(FILE).size;
  const heavy = raw.records.reduce((n, r) =>
    r.isFramework ? n : n + (ownBytes.get(r.id) ?? 0), 0);
  const phaseOne = fileBytes - heavy;
  console.log(`phase one ${(phaseOne / 1e6).toFixed(2)} MB (cap-independent)`);

  for (const cap of [90, 103, 120, 150, 165, 180, 200, 250, 400, 1e9]) {
    let worst = { country: "", bytes: 0, leaves: 0 };
    for (const c of countries) {
      const serving = pub.filter((i) => i.country === c || i.country === "EU");
      const byChannel = new Map<string, typeof serving>();
      for (const i of serving) {
        const k = i.sourceFamilyBucket ?? "(none)";
        byChannel.set(k, [...(byChannel.get(k) ?? []), i]);
      }
      const wanted = new Set<string>();
      let leaves = 0;
      for (const list of byChannel.values()) {
        for (const i of list.slice(0, cap)) {
          leaves++;
          wanted.add(i.id);
          const p = byId.get(i.id)?.parentId;
          if (p && byId.has(p)) wanted.add(p);
        }
      }
      let bytes = 0;
      for (const id of wanted) bytes += ownBytes.get(id) ?? 0;
      if (bytes > worst.bytes) worst = { country: c, bytes, leaves };
    }
    const total = (phaseOne + worst.bytes) / 1e6;
    console.log(`cap ${String(cap === 1e9 ? "none" : cap).padStart(5)}  worst=${worst.country} ` +
      `leaves=${String(worst.leaves).padStart(4)}  phase2=${(worst.bytes / 1e6).toFixed(2)} MB  ` +
      `TOTAL=${total.toFixed(2)} MB${cap === POOL_LEAVES_PER_CHANNEL ? "   <- today" : ""}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
