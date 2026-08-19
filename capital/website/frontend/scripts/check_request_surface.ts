// A FIELD THE PRODUCT READS OFF A REQUEST MUST BE A FIELD A FOUNDER'S OWN
// REQUEST CAN CARRY.
//
// ── What this exists to stop happening again ───────────────────────────────
// `/api/intelligence` read `body.sector`, `body.companyType` and
// `body.targetMarkets`. `basePayload()` in panel.tsx sent none of the three, so
// on every request this product has ever served all three were `undefined`.
// Each omission was individually defensible — sector rides inside
// `eligibility`, companyType is inferred from the description, targetMarkets
// was deliberately dropped from the first screen — and nothing anywhere said
// so, and nothing stopped a harness supplying them.
//
// Forty-odd harnesses supplied `targetMarkets`, including `check_memo_table`,
// which is in `npm run check`. What that bought is worth stating exactly,
// because it is the reason this is a guard and not a bug report: it changed
// NOTHING about country routing — `founderCountryList` returned the explicit
// list only when non-empty, every harness passed the founder's own country, and
// `withIncorporationCountry` had already put that country first in
// `entityCountries`, so both branches returned the same array on 7,095 of 7,095
// recall rows and on all 24 bench founders. The benches were accidentally
// right. What it DID buy was a line in the model's context — "Target markets
// for public capital: X" — that no founder's request could produce.
//
// Accidentally right is not a property. It held because every harness happened
// to pass the one value that collapses, and the next harness to pass two
// countries would have moved a published number with nothing to catch it.
//
// ── The property ──────────────────────────────────────────────────────────
//
//     EVERY FIELD OF THE REQUEST THAT ANYTHING READS IS A FIELD THE PANEL'S
//     OWN PAYLOAD CAN CARRY.
//
// Two halves, both decided against source rather than a list:
//
//   ROUTES     every `body.X` a route under app/api/intelligence reads must be
//              a key panel.tsx sends TO THAT ROUTE. Per route, not a union: the
//              memo route may not read `wantProfileSignal` merely because the
//              intake route is sent one.
//   HARNESSES  every request-shaped object literal in the tree must name only
//              fields the panel can send. Request-shaped is DETECTED, not
//              listed — three or more keys of `IntelligenceRequest`, whose
//              members are read out of types.ts — so a field added to the
//              request tomorrow is in scope on the next run.
//
// ── Why no field is named in this file ────────────────────────────────────
// A rule naming `sector`, `companyType` and `targetMarkets` would be a patch
// that lies the day a fourth appears, and `check_contracts` fails the build on
// exactly that shape. Both sides of both halves are derived: the sendable set
// from `panel.tsx`, the read set from the route files, the field universe from
// the `IntelligenceRequest` interface. Rename any of them and this still holds;
// add a field to the form and it is allowed on the next run with no edit here.
//
// ── Its relationship to check_harness_intake ──────────────────────────────
// It is that guard ONE LEVEL UP, which is what the red-debt register said and
// is worth confirming rather than assuming. `check_harness_intake` asks whether
// a harness answered the intake FOR the founder — its subject is
// `EligibilityAnswers`, the contents of one request field. This asks whether
// the question is answerable by a founder AT ALL — its subject is the request
// itself. They share a detector shape (an object literal naming three or more
// keys of a derived universe) and now share its implementation, in
// `lib/intelligence/__sourceScan.ts`; they do not overlap in what they judge.
//
// One class is outside BOTH, and it is the class that did the damage, so it is
// stated rather than implied: an argument that is not a request field at all.
// `founderCountryList(country, targetMarkets, entityCountries)` took the
// founder's countries directly, below the request, and no rule about request
// bodies could see it. That parameter is gone (wsIK) rather than guarded,
// because the honest fix for a fiction a harness can construct is to make it
// unconstructible. `founderIntake`'s own runtime rule covers the replay
// harnesses' `computeVerdict` options.
//
//   npx tsx scripts/check_request_surface.ts
//   SELFTEST=1 npx tsx scripts/check_request_surface.ts   # prove it can fail
//
// FREE: reads one committed tree. No credentials, no network, no database,
// nothing gitignored.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import {
  matchBrace, stripCommentsAndStrings, topLevelKeys, topLevelMembers,
} from "../lib/intelligence/__sourceScan";
import { panelSends, routeReads } from "../lib/intelligence/__founderPath";

const ROOT = process.cwd();
const ROUTE_DIR = path.join(ROOT, "app", "api", "intelligence");

/** Every member of `IntelligenceRequest`, read out of the interface.
 *
 *  From the type rather than from a constant, because the type is the thing
 *  everything else already agrees on: the routes build one, the pipeline reads
 *  one, and a field added to it is a field this guard must judge without
 *  anybody remembering to come here. */
export function requestFields(): string[] {
  const src = stripCommentsAndStrings(
    readFileSync(path.join(ROOT, "lib", "intelligence", "types.ts"), "utf8"));
  const at = src.indexOf("interface IntelligenceRequest");
  if (at < 0) return [];
  const open = src.indexOf("{", at);
  const close = matchBrace(src, open);
  if (open < 0 || close < 0) return [];
  return [...new Set(
    src.slice(open + 1, close)
      .split("\n")
      .map((l) => /^\s*([A-Za-z_$][\w$]*)\s*\??\s*:/.exec(l)?.[1])
      .filter((k): k is string => Boolean(k)))].sort();
}

/** Files whose object literals are judged: everything a person writes that is
 *  not the form itself and not a route. Walked, so a new directory of
 *  harnesses is in scope without being added anywhere. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const skipDir = new Set(["node_modules", ".next", "app"]);
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) { if (!skipDir.has(name)) walk(p); continue; }
      if (!name.endsWith(".ts") && !name.endsWith(".tsx")) continue;
      out.push(path.relative(ROOT, p));
    }
  };
  walk(path.join(ROOT, "scripts"));
  walk(path.join(ROOT, "lib"));
  return out;
}

/** The one file whose whole job is to describe this defect, and the form the
 *  sendable set is DERIVED from. Judging either is judging the guard's own
 *  source and the founder's own screen. */
const NOT_JUDGED = new Set([
  "scripts/check_request_surface.ts",
  "lib/intelligence/panel.tsx",
]);

/**
 * Every request-shaped object literal in a source file, with the request
 * fields it names.
 *
 * ── What counts as request-shaped, and why it is not "names a field" ───────
 * A single key is not enough. `country` alone is a property of half the row
 * types in this repo, and a guard that failed on those would be demanding a
 * rename — the kind of demand that gets a guard muted. THREE OR MORE keys of
 * `IntelligenceRequest` in one literal is a request whatever it is assigned to,
 * which is the same threshold and the same argument `check_harness_intake`
 * makes for intakes one level down.
 *
 * A member written `x: undefined` is not a supply. That is `founderIntake`'s
 * own `carriesAnAnswer` rule, and it is the rule rather than a convenience: an
 * absent value carries no claim about the founder, and demanding its deletion
 * would fail the harnesses that write it precisely to say "not this one".
 */
export function requestLiterals(src: string, fields: readonly string[]): string[][] {
  const body = stripCommentsAndStrings(src);
  const known = new Set(fields);
  const out: string[][] = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "{") continue;
    const close = matchBrace(body, i);
    if (close < 0) continue;
    const inner = body.slice(i + 1, close);
    const supplied = topLevelMembers(inner)
      .filter((m) => !/^[A-Za-z_$][\w$]*\s*:\s*undefined\s*$/.test(m))
      .flatMap((m) => topLevelKeys(m))
      .filter((k) => known.has(k));
    if (new Set(supplied).size >= 3) out.push([...new Set(supplied)].sort());
  }
  return out;
}

function selfTest(fields: string[], sendable: Set<string>): string[] {
  const bad: string[] = [];
  // The detector, on synthetic sources, before anything real is judged. A
  // detector nobody has seen fail is a detector nobody can trust.
  const F = ["company", "country", "description", "capitalSought", "eligibility"];
  const cases: [string, string, number][] = [
    ["a three-field request literal is found",
      "const r = { company: a, country: b, description: c };", 1],
    ["two fields are not a request", "const r = { company: a, country: b };", 0],
    ["a field named in a // comment is not",
      "// company: a, country: b, description: c\nconst r = { x: 1 };", 0],
    ["a field named in a string is not",
      'const s = "company: a, country: b, description: c";', 0],
    ["a nested object does not lend its keys upward",
      "const r = { eligibility: { company: a, country: b, description: c } };", 1],
    ["shorthand members count",
      "const r = { company, country, description };", 1],
    ["`x: undefined` is not a supply",
      "const r = { company: a, country: b, description: undefined };", 0],
  ];
  for (const [name, src, want] of cases) {
    const got = requestLiterals(src, F).length;
    if (got !== want) bad.push(`  ${name}: expected ${want} literal(s), detector found ${got}`);
  }
  // Non-vacuity of the two DERIVED sets. Either one coming back empty would
  // make every check below pass by having nothing to compare.
  if (fields.length < 5) {
    bad.push(`  IntelligenceRequest yielded only ${fields.length} field(s) — the `
      + "interface moved or the scanner broke, and an empty universe passes everything");
  }
  if (sendable.size < 5) {
    bad.push(`  panel.tsx yielded only ${sendable.size} sendable key(s) — the form's `
      + "payload could not be read, and an empty sendable set fails everything");
  }
  return bad;
}

function main(): void {
  const fields = requestFields();
  const sends = panelSends();
  const sendable = new Set(Object.values(sends).flat());

  const bad = selfTest(fields, sendable);
  if (bad.length) {
    console.error("check_request_surface: FAILED its own self-test:\n" + bad.join("\n"));
    process.exit(1);
  }

  if (process.env.SELFTEST) {
    // Prove the guard can fail, on the exact defect it was written for.
    const invented = `notAFounderField${Date.now()}`;
    const literal = `const r = { company: a, country: b, ${invented}: c, description: d };`;
    const found = requestLiterals(literal, [...fields, invented]);
    const caught = found.some((keys) => keys.includes(invented));
    if (!caught) {
      console.error("check_request_surface: SELFTEST failed — a request literal "
        + "carrying a field the panel cannot send was NOT caught.");
      process.exit(1);
    }
    console.log(`check_request_surface: SELFTEST ok — an unsendable field in a `
      + `request literal is caught (${found[0].join(", ")}).`);
    return;
  }

  const failures: string[] = [];

  // ── Half one: the routes ────────────────────────────────────────────────
  const routeFiles: string[] = [];
  const walkRoutes = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walkRoutes(p);
      else if (name === "route.ts") routeFiles.push(path.relative(ROOT, p));
    }
  };
  walkRoutes(ROUTE_DIR);
  if (!routeFiles.length) {
    console.error("check_request_surface: FAILED — found no route at all under "
      + `${path.relative(ROOT, ROUTE_DIR)}. Either the routes moved or the walk broke; `
      + "either way this guard was about to pass by having nothing to read.");
    process.exit(1);
  }
  for (const file of routeFiles) {
    const route = "/" + path.relative(ROOT, path.join(ROOT, file))
      .replace(/^app\//, "").replace(/\/route\.ts$/, "");
    const canSend = new Set(sends[route] ?? []);
    if (!canSend.size) {
      failures.push(`  ${file}: panel.tsx never fetches ${route}, so every field it `
        + "reads off the body comes from somewhere that is not a founder");
      continue;
    }
    const unsendable = routeReads(file).filter((f) => !canSend.has(f));
    if (unsendable.length) {
      failures.push(`  ${file}: reads ${unsendable.join(", ")} — panel.tsx sends `
        + `${[...canSend].sort().join(", ")} to ${route} and not ${unsendable.length > 1 ? "those" : "that"}`);
    }
  }

  // ── Half two: the harnesses ─────────────────────────────────────────────
  let literals = 0;
  for (const file of sourceFiles()) {
    if (NOT_JUDGED.has(file)) continue;
    const src = readFileSync(path.join(ROOT, file), "utf8");
    for (const keys of requestLiterals(src, fields)) {
      literals++;
      const unsendable = keys.filter((k) => !sendable.has(k));
      if (unsendable.length) {
        failures.push(`  ${file}: a request literal supplies ${unsendable.join(", ")}, `
          + "which no founder's request carries");
      }
    }
  }
  if (!literals) {
    console.error("check_request_surface: FAILED — found no request literal anywhere "
      + "in scripts/ or lib/. The detector broke, and it was about to pass by having "
      + "nothing to judge.");
    process.exit(1);
  }

  if (failures.length) {
    console.error(`\ncheck_request_surface: FAILED on ${failures.length} site(s):\n`
      + failures.join("\n"));
    console.error("\nA field only a harness can fill is a field the benches can move "
      + "and the founder cannot, so every number measured on it describes a system "
      + "nobody uses. Either add the control to the first screen — the intake is a "
      + "lever, not a fixed input — or delete the read.");
    process.exit(1);
  }
  console.log(`check_request_surface: ok — ${routeFiles.length} route(s) read nothing `
    + `panel.tsx cannot send them, ${literals} request literal(s) across `
    + `${sourceFiles().length} source file(s) name only sendable fields, over `
    + `${fields.length} IntelligenceRequest field(s) and ${sendable.size} sendable key(s).`);
}

main();
