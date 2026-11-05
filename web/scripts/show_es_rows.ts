// Render the rows a Spanish founder is actually offered, before and after the
// naming pass, in a real browser window.
//
// This workstream is measured on what a founder READS, and a claim about that
// cannot be settled by a database query. The five rows below come from the same
// path the memo uses -- buildInstrumentTable -> assessAll -> dedupe -- so the
// names on the page are the names the writer receives, not a re-derivation.
//
// The "before" column is read from the decisions file the naming pass wrote, so
// the comparison is against the exact string the row carried, not a guess.
//
//   npx tsx scripts/show_es_rows.ts <decisions.json> <out.html>
import { readFileSync, writeFileSync } from "node:fs";
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("show_es_rows", ["DATABASE_URL", "VOYAGE_KEY"]);

// A Spanish founder, described the way the intake describes one. Not an
// archetype from __benchCompanies (none is Spanish) -- a profile stated here so
// the page says exactly whose five rows these are.
const PROFILES: Record<string, {company: string; sector: string; description: string;
                                ticketBand: string; fteBand: string; developmentStage: string}> = {
  rnd: {
    company: "a Spanish industrial-software company",
    sector: "software",
    description:
      "Empresa española de software industrial que desarrolla sistemas de control y " +
      "digitalización para plantas de fabricación. Busca financiación para un proyecto " +
      "de I+D+i y para la digitalización de su proceso productivo.",
    ticketBand: "500k-2m", fteBand: "10-49", developmentStage: "scaling",
  },
  manufacturing: {
    company: "a Spanish manufacturing SME",
    sector: "manufacturing",
    description:
      "Pyme industrial española del sector manufacturero. Quiere invertir en la " +
      "modernización de su planta, en eficiencia energética y en la competitividad y " +
      "digitalización de su actividad industrial.",
    ticketBand: "500k-2m", fteBand: "50-249", developmentStage: "scaling",
  },
};
const FOUNDER = { country: "ES", ...(PROFILES[process.argv[4] ?? "rnd"] ?? PROFILES.rnd) };

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function main() {
  const [, , decisionsPath, outPath = "/tmp/es_rows.html"] = process.argv;
  const decisions: { id: string; name: string; new_name?: string; outcome: string }[] =
    JSON.parse(readFileSync(decisionsPath, "utf8"));
  const before = new Map(decisions.map((d) => [d.id, d.name]));

  const { hydrateDbInstruments } = await import("../lib/intelligence/corpus");
  const P = await import("../lib/intelligence/shortlist");
  const { assessAll } = await import("../lib/intelligence/verdict");
  const { semanticFundMatch } = await import("../lib/intelligence/semantic");
  await hydrateDbInstruments();

  const el = {
    sector: FOUNDER.sector, entityCountries: [FOUNDER.country], exclusionFlags: ["none"],
    cofinancingBand: ">50%", consortium: "unsure", borrowerModel: "operating",
    fteBand: FOUNDER.fteBand, ticketBand: FOUNDER.ticketBand,
    developmentStage: FOUNDER.developmentStage,
  } as never;

  const table = P.applyProfileSignal(
    P.buildInstrumentTable({
      fieldChannels: new Set<string>(),
      ticketBand: FOUNDER.ticketBand,
      consortiumOk: true,
      founderCountries: [FOUNDER.country],
      capitalSought: ["grant", "loan"],
      description: FOUNDER.description,
      semantic: await semanticFundMatch(FOUNDER.description),
    }).slice(0, 18),
    undefined, undefined);

  const ids = table.map((r) => r.instrumentId).filter(Boolean) as string[];
  const a = assessAll(ids, el);
  const alive = table.filter((r) => r.instrumentId && a.get(r.instrumentId)?.status !== "blocked");
  const seen = new Set<string>();
  const deduped = alive.filter((r) => {
    const n = P.displayInstitutionName(r);
    if (seen.has(n)) return false; seen.add(n); return true;
  });
  const five = deduped.slice(0, 5);

  const rows = five.map((r, i) => {
    const id = r.instrumentId as string;
    const now = P.displayInstitutionName(r);
    const was = before.get(id);
    const changed = was !== undefined && was !== now;
    return `<li>
      <div class="rank">${i + 1}</div>
      <div class="pair">
        <div class="col was ${changed ? "" : "same"}">
          <span class="lab">before</span>
          <p>${esc(was ?? now)}</p>
        </div>
        <div class="col now ${changed ? "changed" : "same"}">
          <span class="lab">after</span>
          <p>${esc(now)}</p>
        </div>
      </div>
    </li>`;
  }).join("\n");

  const changedCount = five.filter((r) => {
    const w = before.get(r.instrumentId as string);
    return w !== undefined && w !== P.displayInstitutionName(r);
  }).length;

  writeFileSync(outPath, `<!doctype html><meta charset="utf-8">
<title>A Spanish founder's five rows</title>
<style>
  :root { --ink:#15130f; --paper:#faf7f0; --rule:#ddd6c7; --was:#8a2f22; --now:#1f5c3a; }
  body { margin:0; background:var(--paper); color:var(--ink);
         font:16px/1.5 Georgia, "Times New Roman", serif; }
  main { max-width: 1080px; margin: 0 auto; padding: 48px 32px 96px; }
  h1 { font-size: 30px; margin: 0 0 6px; letter-spacing: -0.01em; }
  .sub { color:#6b6355; font-size:15px; margin:0 0 6px; }
  .who { color:#6b6355; font-size:14px; margin:0 0 32px; font-style: italic; }
  ol { list-style:none; margin:0; padding:0; }
  li { display:flex; gap:20px; padding:22px 0; border-top:1px solid var(--rule); }
  .rank { font-size:13px; color:#9a9082; width:22px; padding-top:20px; }
  .pair { flex:1; display:grid; grid-template-columns:1fr 1fr; gap:24px; }
  @media (max-width: 800px) { .pair { grid-template-columns: 1fr; } }
  .lab { font:11px/1 ui-sans-serif,system-ui,sans-serif; letter-spacing:.09em;
         text-transform:uppercase; color:#9a9082; display:block; margin-bottom:8px; }
  .col p { margin:0; font-size:17px; }
  .was p { color:var(--was); }
  .now.changed p { color:var(--now); font-weight:600; }
  .same p { color:#9a9082; }
  footer { margin-top:40px; border-top:1px solid var(--rule); padding-top:16px;
           font:13px/1.6 ui-sans-serif,system-ui,sans-serif; color:#6b6355; }
</style>
<main>
  <h1>A Spanish founder's five rows</h1>
  <p class="sub">The same ranked rows, through the same memo path, before and after the naming pass.
     ${changedCount} of 5 changed.</p>
  <p class="who">${esc(FOUNDER.company)} &mdash; ${esc(FOUNDER.description)}</p>
  <ol>${rows}</ol>
  <footer>
    Rows produced by <code>buildInstrumentTable</code> &rarr; <code>assessAll</code> &rarr; dedupe,
    the path the memo writer is fed from. Names read live out of Postgres;
    &ldquo;before&rdquo; read from the naming pass&rsquo;s own decision record.
  </footer>
</main>`);
  console.log(`${five.length} rows, ${changedCount} renamed -> ${outPath}`);
  for (const r of five) {
    const id = r.instrumentId as string;
    console.log(`  before: ${(before.get(id) ?? "").slice(0, 96)}`);
    console.log(`  after : ${P.displayInstitutionName(r).slice(0, 96)}\n`);
  }
}
main();
