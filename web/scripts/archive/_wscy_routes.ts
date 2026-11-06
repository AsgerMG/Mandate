/**
 * wsCY — AUDIT ONLY, no writes, no model calls, no embeddings.
 *
 * Measures the application-route INHERITANCE in hydrateDbInstruments():
 *
 *   application: appByInstrument.get(inst.id)
 *             ?? (inst.parent_id ? appByInstrument.get(inst.parent_id) : undefined)
 *             ?? null
 *
 * A leaf with no curated route of its own publishes its PARENT regime's route.
 * This script counts how often that happens over publishableInstruments(), and
 * on how many of those the child differs from the parent on a field that could
 * make the parent's addressee false for the child.
 *
 * Run: npx tsx scripts/_wscy_routes.ts
 */
import { loadEnvLocal, requireCredentials } from "../loadEnv";

loadEnvLocal();
requireCredentials("_wscy_routes", ["DATABASE_URL"]);

type App = { channel: string | null; timeline: string | null; url: string | null };

function norm(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).sort().join(" | ");
  return String(v).trim();
}

const FIELDS = [
  "country",
  "administeringBody",
  "deliveryRegion",
  "deliveryRegionShare",
  "schemeOperators",
  "capitalType",
  "sourceFamilyBucket",
] as const;

async function main() {
  const { hydrateDbInstruments, publishableInstruments, loadDbInstruments } =
    await import("../../lib/intelligence/corpus");
  await hydrateDbInstruments();

  const all = loadDbInstruments();
  const byId = new Map(all.map((i) => [i.id, i]));
  const pub = publishableInstruments();

  // ── The RAW per-instrument-id rows, read straight from the table that
  // populates appByInstrument. The hydrated object cannot tell an own route
  // from an inherited one: both land in `application` identically.
  const SQL = `SELECT instrument_id, channel, timeline, url FROM instrument_application`;
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  const raw = await client.query(SQL);
  await client.end();
  const ownApp = new Map<string, App>(
    (raw.rows as { instrument_id: string; channel: string | null; timeline: string | null; url: string | null }[])
      .map((r) => [r.instrument_id, { channel: r.channel, timeline: r.timeline, url: r.url }]));

  console.log(`SQL RUN: ${SQL}`);
  console.log(`instrument_application rows: ${raw.rows.length}, distinct instrument_id: ${ownApp.size}`);
  console.log(`corpus instruments: ${all.length}   publishable: ${pub.length}`);
  console.log("");

  // ── 1. own vs inherited ────────────────────────────────────────────────
  const withRoute = pub.filter((i) => i.application);
  const own = withRoute.filter((i) => ownApp.has(i.id));
  const inherited = withRoute.filter((i) => !ownApp.has(i.id));
  const noRoute = pub.filter((i) => !i.application);
  console.log("=== 1. ROUTE PROVENANCE OVER PUBLISHABLE ROWS ===");
  console.log(`publishable                 : ${pub.length}`);
  console.log(`  has application route     : ${withRoute.length}`);
  console.log(`    OWN (own id in table)   : ${own.length}`);
  console.log(`    INHERITED from parent   : ${inherited.length}`);
  console.log(`  no route at all           : ${noRoute.length}`);
  const routeless = new Set(pub.filter((i) => !i.application).map((i) => i.id));
  console.log(`  (of the routeless, how many have a parent: ${pub.filter((i) => routeless.has(i.id) && i.parentId).length})`);
  const distinctRoutes = new Set(withRoute.map((i) => norm(i.application?.channel)));
  console.log(`distinct channel strings over publishable-with-route: ${distinctRoutes.size}`);
  console.log("");

  // sanity: are any "inherited" actually parentless (i.e. impossible)?
  const orphan = inherited.filter((i) => !i.parentId || !ownApp.has(i.parentId));
  console.log(`inherited rows whose route does NOT come from a parent row in the table: ${orphan.length}`);
  for (const o of orphan.slice(0, 5)) console.log(`   ! ${o.id} ${o.name} parent=${o.parentId ?? "-"}`);
  console.log("");

  // ── 2. field-by-field divergence on inherited rows ─────────────────────
  console.log("=== 2. INHERITED ROWS: CHILD vs PARENT, FIELD BY FIELD ===");
  type Diff = { field: string; child: string; parent: string };
  const diffsFor = (i: (typeof pub)[number]): Diff[] => {
    const p = i.parentId ? byId.get(i.parentId) : undefined;
    if (!p) return [];
    const out: Diff[] = [];
    for (const f of FIELDS) {
      const c = norm((i as unknown as Record<string, unknown>)[f]);
      const pv = norm((p as unknown as Record<string, unknown>)[f]);
      if (c !== pv) out.push({ field: f, child: c, parent: pv });
    }
    return out;
  };
  const diffMap = new Map<string, Diff[]>();
  for (const i of inherited) diffMap.set(i.id, diffsFor(i));

  const perField = new Map<string, number>();
  const perFieldBothPresent = new Map<string, number>();
  for (const [, ds] of diffMap) {
    for (const d of ds) {
      perField.set(d.field, (perField.get(d.field) ?? 0) + 1);
      if (d.child && d.parent) {
        perFieldBothPresent.set(d.field, (perFieldBothPresent.get(d.field) ?? 0) + 1);
      }
    }
  }
  console.log(`inherited rows analysed: ${inherited.length}`);
  for (const f of FIELDS) {
    console.log(`  differs on ${f.padEnd(20)}: ${String(perField.get(f) ?? 0).padStart(4)}`
      + `   (of which both sides non-empty: ${perFieldBothPresent.get(f) ?? 0})`);
  }
  const anyDiff = [...diffMap.values()].filter((d) => d.length > 0).length;
  console.log(`  differs on AT LEAST ONE field: ${anyDiff} / ${inherited.length}`
    + ` (${((anyDiff / Math.max(1, inherited.length)) * 100).toFixed(1)}%)`);
  const identical = inherited.length - anyDiff;
  console.log(`  identical on all ${FIELDS.length} fields: ${identical}`);
  console.log("");

  // ── 3. the territorial case ────────────────────────────────────────────
  console.log("=== 3. TERRITORIAL / ADDRESSEE MISMATCH ===");
  // Any child that names a delivery region its parent does not name.
  const regionDiff = inherited.filter((i) => {
    const d = diffMap.get(i.id) ?? [];
    return d.some((x) => x.field === "deliveryRegion");
  });
  const regionChildOnly = regionDiff.filter((i) => {
    const d = (diffMap.get(i.id) ?? []).find((x) => x.field === "deliveryRegion")!;
    return d.child !== "" && d.parent === "";
  });
  const regionBoth = regionDiff.filter((i) => {
    const d = (diffMap.get(i.id) ?? []).find((x) => x.field === "deliveryRegion")!;
    return d.child !== "" && d.parent !== "";
  });
  const bodyDiff = inherited.filter((i) =>
    (diffMap.get(i.id) ?? []).some((x) => x.field === "administeringBody"));
  const bodyDiffBoth = inherited.filter((i) =>
    (diffMap.get(i.id) ?? []).some((x) => x.field === "administeringBody" && x.child && x.parent));
  const territorial = inherited.filter((i) =>
    (diffMap.get(i.id) ?? []).some((x) =>
      (x.field === "deliveryRegion" && x.child !== "") ||
      (x.field === "administeringBody" && x.child !== "")));
  console.log(`child names a deliveryRegion the parent does not / differs : ${regionDiff.length}`);
  console.log(`   child has a region, parent has NONE (national parent)   : ${regionChildOnly.length}`);
  console.log(`   both have a region and they DIFFER                      : ${regionBoth.length}`);
  console.log(`administeringBody differs                                  : ${bodyDiff.length}`);
  console.log(`   both sides non-empty and different                      : ${bodyDiffBoth.length}`);
  console.log(`TERRITORIAL SET (own region or own body, differing)        : ${territorial.length}`);
  console.log("");
  console.log("--- distinct deliveryRegion values among inherited rows that have one ---");
  const regCount = new Map<string, number>();
  for (const i of inherited) {
    const r = norm(i.deliveryRegion);
    if (r) regCount.set(r, (regCount.get(r) ?? 0) + 1);
  }
  for (const [r, n] of [...regCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    console.log(`   ${String(n).padStart(4)}  ${r}`);
  }
  console.log("");
  console.log("--- 12 concrete territorial examples ---");
  const examples = territorial
    .slice()
    .sort((a, b) => {
      // Dutch first (the observed defect), then region-bearing children.
      const s = (x: (typeof pub)[number]) => (x.country === "NL" || x.country === "Netherlands" ? 0 : 1);
      return s(a) - s(b);
    })
    .slice(0, 12);
  for (const i of examples) {
    const p = byId.get(i.parentId!)!;
    console.log(`CHILD  : ${i.name}   [${i.id}]  country=${i.country}`);
    console.log(`PARENT : ${p.name}   [${p.id}]`);
    console.log(`ROUTE  : ${JSON.stringify(i.application?.channel)}`);
    for (const d of diffMap.get(i.id) ?? []) {
      console.log(`  DIFF ${d.field}: child=${JSON.stringify(d.child)}  parent=${JSON.stringify(d.parent)}`);
    }
    console.log("");
  }

  // ── 4. largest inherited-route clusters ────────────────────────────────
  console.log("=== 4. LARGEST INHERITED-ROUTE CLUSTERS ===");
  const cluster = new Map<string, string[]>();
  for (const i of inherited) {
    const k = norm(i.application?.channel) || "(null channel)";
    const l = cluster.get(k) ?? []; l.push(i.id); cluster.set(k, l);
  }
  const ranked = [...cluster.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  for (const [text, ids] of ranked) {
    const diff = ids.filter((id) => (diffMap.get(id) ?? []).length > 0).length;
    const terr = ids.filter((id) => (diffMap.get(id) ?? []).some((x) =>
      (x.field === "deliveryRegion" && x.child !== "") || (x.field === "administeringBody" && x.child !== ""))).length;
    const parents = new Set(ids.map((id) => byId.get(id)?.parentId ?? "-"));
    console.log(`${String(ids.length).padStart(4)} children | differ>=1 field: ${String(diff).padStart(4)}`
      + ` | territorial: ${String(terr).padStart(4)} | distinct parents: ${parents.size}`);
    console.log(`      ROUTE: ${JSON.stringify(text)}`);
    console.log(`      parents: ${[...parents].map((p) => byId.get(p)?.name ?? p).slice(0, 4).join(" ; ")}`);
    console.log(`      sample children: ${ids.slice(0, 3).map((id) => byId.get(id)?.name).join(" ; ")}`);
    console.log("");
  }

  // ── 5. the route text itself ───────────────────────────────────────────
  console.log("=== 5. 20 MOST COMMON CHANNEL STRINGS (all publishable rows with a route) ===");
  const chanCount = new Map<string, { total: number; own: number; inh: number }>();
  for (const i of withRoute) {
    const k = norm(i.application?.channel) || "(null channel)";
    const e = chanCount.get(k) ?? { total: 0, own: 0, inh: 0 };
    e.total++;
    if (ownApp.has(i.id)) e.own++; else e.inh++;
    chanCount.set(k, e);
  }
  for (const [text, e] of [...chanCount.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 20)) {
    console.log(`n=${String(e.total).padStart(4)} own=${String(e.own).padStart(4)} inherited=${String(e.inh).padStart(4)}`);
    console.log(`   ${JSON.stringify(text)}`);
  }
  console.log("");

  // ── 6. what else does application carry ────────────────────────────────
  console.log("=== 6. APPLICATION PAYLOAD SHAPE ===");
  const keySet = new Set<string>();
  for (const i of withRoute) for (const k of Object.keys(i.application ?? {})) keySet.add(k);
  console.log(`keys present on hydrated application objects: ${[...keySet].sort().join(", ")}`);
  const pop = (sel: (a: App) => unknown, rows: typeof withRoute) =>
    rows.filter((i) => {
      const v = sel(i.application as App);
      return v !== null && v !== undefined && String(v).trim() !== "";
    }).length;
  for (const [label, rows] of [["ALL with route", withRoute], ["OWN", own], ["INHERITED", inherited]] as const) {
    console.log(`${label.padEnd(16)} n=${String(rows.length).padStart(4)}`
      + `  channel=${String(pop((a) => a.channel, rows)).padStart(4)}`
      + `  timeline=${String(pop((a) => a.timeline, rows)).padStart(4)}`
      + `  url=${String(pop((a) => a.url, rows)).padStart(4)}`);
  }
  console.log("");
  console.log("--- URL provenance on INHERITED rows ---");
  // The instrument's OWN application_url column is a separate field on
  // funding_instruments; application.url on an inherited row is the parent's.
  let inhUrl = 0, childHasOwnUrl = 0, urlsDiffer = 0, urlsSame = 0, childNoOwnUrl = 0;
  for (const i of inherited) {
    const u = i.application?.url;
    if (!u) continue;
    inhUrl++;
    const ownUrl = i.applicationUrl;
    if (ownUrl) {
      childHasOwnUrl++;
      if (norm(ownUrl) !== norm(u)) urlsDiffer++; else urlsSame++;
    } else childNoOwnUrl++;
  }
  console.log(`inherited rows carrying application.url (the PARENT's url) : ${inhUrl}`);
  console.log(`   child also has its own funding_instruments.application_url : ${childHasOwnUrl}`);
  console.log(`      and it DIFFERS from the inherited url                   : ${urlsDiffer}`);
  console.log(`      and it is the SAME                                      : ${urlsSame}`);
  console.log(`   child has no own application_url at all                    : ${childNoOwnUrl}`);
  console.log("");
  console.log("--- 8 examples where the child's own application_url differs from the inherited route url ---");
  let shown = 0;
  for (const i of inherited) {
    if (shown >= 8) break;
    const u = i.application?.url;
    if (!u || !i.applicationUrl || norm(i.applicationUrl) === norm(u)) continue;
    const p = byId.get(i.parentId!);
    console.log(`  ${i.name}  [${i.country}]`);
    console.log(`     inherited route url (parent ${p?.name}): ${u}`);
    console.log(`     child's own application_url            : ${i.applicationUrl}`);
    shown++;
  }
  console.log("");
  console.log("--- timeline strings on inherited rows (top 10) ---");
  const tl = new Map<string, number>();
  for (const i of inherited) {
    const t = norm(i.application?.timeline);
    if (t) tl.set(t, (tl.get(t) ?? 0) + 1);
  }
  for (const [t, n] of [...tl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${String(n).padStart(4)}  ${JSON.stringify(t)}`);
  }

  // ── 7. direction of the empty-side diffs ───────────────────────────────
  console.log("");
  console.log("=== 7. DIRECTION OF DIFFS (which side is empty) ===");
  for (const f of FIELDS) {
    let childOnly = 0, parentOnly = 0, both = 0;
    for (const [, ds] of diffMap) {
      const d = ds.find((x) => x.field === f);
      if (!d) continue;
      if (d.child && !d.parent) childOnly++;
      else if (!d.child && d.parent) parentOnly++;
      else both++;
    }
    console.log(`  ${f.padEnd(20)} child-only=${String(childOnly).padStart(4)}`
      + ` parent-only=${String(parentOnly).padStart(4)} both-differ=${String(both).padStart(4)}`);
  }

  // ── 8. THE ADDRESSEE TEST ──────────────────────────────────────────────
  // Does the inherited route text actually name the child's own administering
  // body? If not, the sentence a founder reads addresses someone else.
  console.log("");
  console.log("=== 8. ADDRESSEE TEST: does the inherited route text name the CHILD's body? ===");
  const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const STOP = new Set(["de", "van", "der", "den", "des", "du", "la", "le", "el", "di", "der",
    "ministerie", "ministry", "provincie", "province", "gmbh", "ab", "as", "sa", "the", "of",
    "and", "en", "und", "et", "fur", "for", "voor", "agency", "agentur", "national", "nationale"]);
  const tokens = (s: string) => fold(s).split(" ").filter((t) => t.length >= 4 && !STOP.has(t));
  let named = 0, notNamed = 0, noBody = 0;
  const misaddressed: { i: (typeof pub)[number]; p: (typeof pub)[number] }[] = [];
  for (const i of inherited) {
    const body = norm(i.administeringBody);
    const text = fold(norm(i.application?.channel));
    if (!body) { noBody++; continue; }
    const ts = tokens(body);
    const hit = ts.length > 0 && ts.some((t) => text.includes(t));
    if (hit) named++;
    else {
      notNamed++;
      const p = byId.get(i.parentId!);
      if (p) misaddressed.push({ i, p });
    }
  }
  console.log(`inherited rows with an administeringBody      : ${inherited.length - noBody}`);
  console.log(`  route text NAMES that body (token overlap)  : ${named}`);
  console.log(`  route text does NOT name it (misaddressed)  : ${notNamed}`);
  console.log(`inherited rows with no administeringBody      : ${noBody}`);
  // Of the misaddressed, how many also carry a sub-national deliveryRegion?
  const misSubnat = misaddressed.filter(({ i }) => norm(i.deliveryRegion).length > 2);
  const misAnyRegion = misaddressed.filter(({ i }) => norm(i.deliveryRegion) !== "");
  console.log(`  ... of the misaddressed, carrying ANY deliveryRegion       : ${misAnyRegion.length}`);
  console.log(`  ... of the misaddressed, region code longer than 2 chars   : ${misSubnat.length}`);
  console.log("");
  console.log("--- 10 misaddressed examples ---");
  for (const { i, p } of misaddressed.slice(0, 10)) {
    console.log(`  child=${i.name.slice(0, 90)}`);
    console.log(`    parent=${p.name}  childBody=${JSON.stringify(norm(i.administeringBody))}`
      + `  parentBody=${JSON.stringify(norm(p.administeringBody))}  region=${JSON.stringify(norm(i.deliveryRegion))}`);
    console.log(`    route=${JSON.stringify(norm(i.application?.channel).slice(0, 160))}`);
  }

  // ── 9. parents that supply inherited routes ────────────────────────────
  console.log("");
  console.log("=== 9. PARENTS SUPPLYING INHERITED ROUTES ===");
  const byParent = new Map<string, string[]>();
  for (const i of inherited) {
    const k = i.parentId!;
    const l = byParent.get(k) ?? []; l.push(i.id); byParent.set(k, l);
  }
  console.log(`distinct parents supplying a route to a publishable child: ${byParent.size}`);
  for (const [pid, ids] of [...byParent.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
    const d = ids.filter((id) => (diffMap.get(id) ?? []).length > 0).length;
    console.log(`  ${String(ids.length).padStart(4)} children  differ>=1: ${String(d).padStart(4)}   ${byId.get(pid)?.name} [${pid}]`);
  }

  // ── 10. applicationUrl population overall ──────────────────────────────
  console.log("");
  console.log("=== 10. funding_instruments.application_url population ===");
  console.log(`publishable rows with their own application_url : ${pub.filter((i) => i.applicationUrl).length} / ${pub.length}`);
  console.log(`  of those, OWN curated route                   : ${pub.filter((i) => i.applicationUrl && ownApp.has(i.id)).length}`);
  console.log(`  of those, INHERITED route                     : ${pub.filter((i) => i.applicationUrl && i.application && !ownApp.has(i.id)).length}`);
  console.log(`inherited rows with NO url anywhere (route url null AND own application_url null): `
    + `${inherited.filter((i) => !i.application?.url && !i.applicationUrl).length}`);
  console.log(`routeless publishable rows (no application at all): ${noRoute.length},`
    + ` of which carry an application_url: ${noRoute.filter((i) => i.applicationUrl).length}`);

  // ── 11. is the child's region genuinely SUB-national? ──────────────────
  // A NUTS-1 code that is the only NUTS-1 in its country (CZ0, SK0, IE0, LU00)
  // covers the whole state and is NOT a territorial conflict with a national
  // route. Split the misaddressed set on that.
  console.log("");
  console.log("=== 11. MISADDRESSED ROWS BY REGION CODE (sub-national vs whole-country NUTS-1) ===");
  const nutsByCountry = new Map<string, Set<string>>();
  for (const i of all) {
    const r = norm(i.deliveryRegion);
    if (!r) continue;
    const c = r.slice(0, 2);
    const s = nutsByCountry.get(c) ?? new Set<string>(); s.add(r.slice(0, 3)); nutsByCountry.set(c, s);
  }
  const misRegions = new Map<string, number>();
  let subnat = 0, wholeCountry = 0;
  for (const { i } of misaddressed) {
    const r = norm(i.deliveryRegion);
    if (!r) continue;
    misRegions.set(r, (misRegions.get(r) ?? 0) + 1);
    const sole = (nutsByCountry.get(r.slice(0, 2))?.size ?? 0) <= 1;
    if (sole && r.length <= 4) wholeCountry++; else subnat++;
  }
  console.log(`misaddressed rows with a region : ${misaddressed.filter(({ i }) => norm(i.deliveryRegion)).length}`);
  console.log(`  genuinely SUB-national region : ${subnat}`);
  console.log(`  whole-country NUTS-1 code     : ${wholeCountry}`);
  console.log(`(NUTS-1 codes seen per country: `
    + [...nutsByCountry.entries()].sort().map(([c, s]) => `${c}:${s.size}`).join(" ") + `)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
