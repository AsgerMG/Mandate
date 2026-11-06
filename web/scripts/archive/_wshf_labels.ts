// @ws-active until 2026-09-30
// What a founder actually SEES, before and after the rename: the shipped
// doorLabel(), not a guess about it. Free, offline, snapshot only.
import { doorLabel, __resetAmbiguousSchemes } from "../../lib/intelligence/doorLabel";

const NEW: Record<string, string> = {
  "SA.40391": "Régime cadre exempté de notification relatif aux aides à la recherche, au développement et à l’innovation (RDI) pour la période 2014-2023",
  "SA.56245": "Steuerliche Förderung von Forschung und Entwicklung [BMF]",
  "SA.49781": "Intervento del fondo per la crescita sostenibile a favore di progetti di ricerca e sviluppo realizzati nell''ambito di accordi sottoscritti dal Ministero dello sviluppo economico con le regioni e le altre amministrazioni pubbliche.",
};

async function main() {
  delete process.env.DATABASE_URL;
  const { loadDbInstruments } = await import("../../lib/intelligence/corpus");
  const rows = (loadDbInstruments() as any[]).filter((r) => NEW[r.schemeCode ?? ""]);
  __resetAmbiguousSchemes();
  const seenBefore = new Set<string>(), seenAfter = new Set<string>();
  for (const r of rows) {
    const x = { administeringBody: r.administeringBody, administeringBodyShare: r.administeringBodyShare, schemeCode: r.schemeCode };
    const before = doorLabel(r.name, x);
    const after = doorLabel(NEW[r.schemeCode], x);
    seenBefore.add(before); seenAfter.add(after);
    console.log(`${r.schemeCode}\n  BEFORE  ${before}\n  AFTER   ${after}\n`);
  }
  console.log(`distinct labels shown to a founder: BEFORE ${seenBefore.size}, AFTER ${seenAfter.size}, over ${rows.length} rows`);
  for (const s of [...seenAfter].sort()) {
    const n = rows.filter((r) => doorLabel(NEW[r.schemeCode], { administeringBody: r.administeringBody, administeringBodyShare: r.administeringBodyShare, schemeCode: r.schemeCode }) === s).length;
    if (n > 1) console.log(`  COLLIDES x${n}: ${s}`);
  }
}
main();
