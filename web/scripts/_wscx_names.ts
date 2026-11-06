// wsCX — evidence for FUND-7 and FUND-3. FREE: one Postgres read, no model
// calls, no Voyage embed.
//
//   npx tsx scripts/_wscx_names.ts
import { loadEnvLocal, requireCredentials } from "./loadEnv";

loadEnvLocal();
requireCredentials("wscx_names", ["DATABASE_URL"]);

import {
  hydrateDbInstruments, loadDbInstruments, publishableInstruments, requireLiveCorpus,
} from "../lib/intelligence/corpus";
import { namesAnApplyableBody } from "../lib/intelligence/applyableBody";
const NOT_AN_APPLYABLE_BODY = { test: (s: string) => !namesAnApplyableBody(s) };
import { doorLabelFor } from "../lib/intelligence/doorLabel";

async function main() {
  await hydrateDbInstruments();
  requireLiveCorpus("wscx_names");
  const corpus = loadDbInstruments();
  const pub = publishableInstruments();
  console.log(`corpus ${corpus.length}, publishable ${pub.length}`);

  // 1. How many publishable names carry a bracketed trailing token?
  const bracketed = pub.filter((i) => /\[[^\]]{2,40}\]\s*$/.test(i.name));
  console.log(`\n[1] publishable names ending in a bracketed token: ${bracketed.length}`);
  for (const i of bracketed.slice(0, 25)) console.log(`    ${i.country} | ${i.name}`);

  // 2. What the CURRENT FUND-7 regex catches, on the name and on the body.
  const nameHits = pub.filter((i) => NOT_AN_APPLYABLE_BODY.test(i.name));
  const bodies = new Map<string, number>();
  for (const i of corpus) {
    const b = i.administeringBody?.trim();
    if (b) bodies.set(b, (bodies.get(b) ?? 0) + 1);
  }
  const bodyHits = [...bodies.keys()].filter((b) => NOT_AN_APPLYABLE_BODY.test(b));
  console.log(`\n[2] current regex: ${nameHits.length}/${pub.length} publishable names, ` +
    `${bodyHits.length}/${bodies.size} distinct administering bodies`);

  // 3. Bodies containing a department stem ANYWHERE (compound-aware), which the
  //    start-anchored regex cannot see.
  const ANY = /minist|department|départ|departament|dipartiment|ministerstw|ministerstv|ministeri|miniszt|ministarstv/i;
  const missedBodies = [...bodies.entries()]
    .filter(([b]) => ANY.test(b) && !NOT_AN_APPLYABLE_BODY.test(b))
    .sort((a, b) => b[1] - a[1]);
  console.log(`\n[3] administering bodies a compound-aware stem catches and ^ misses: ${missedBodies.length}`);
  for (const [b, n] of missedBodies.slice(0, 30)) console.log(`    ${n.toString().padStart(4)}  ${b}`);

  // 4. Names (publishable) where the same test fires anywhere but not at the start.
  const missedNames = pub.filter((i) => ANY.test(i.name) && !NOT_AN_APPLYABLE_BODY.test(i.name));
  console.log(`\n[4] publishable NAMES with a department stem the ^ regex misses: ${missedNames.length}`);
  for (const i of missedNames.slice(0, 30)) console.log(`    ${i.country} | ${i.name}`);

  // 5. Does doorLabel currently append a ministry as a door?
  const ministryDoors = pub
    .map((i) => ({ i, label: doorLabelFor(i) }))
    .filter(({ i, label }) => label !== i.name && ANY.test(label));
  console.log(`\n[5] rows doorLabel would render "via <a ministry>": ${ministryDoors.length}`);
  for (const { label } of ministryDoors.slice(0, 20)) console.log(`    ${label}`);

  // 6. schemeOperators coverage — the contract's stated alternative to a ministry.
  const withOps = pub.filter((i) => (i.schemeOperators?.length ?? 0) > 0);
  console.log(`\n[6] publishable rows carrying schemeOperators: ${withOps.length}/${pub.length}`);

  // 7. The "same ministry unit" case: publishable leaves grouped by administering body.
  const byBody = new Map<string, string[]>();
  for (const i of pub) {
    const b = i.administeringBody?.trim();
    if (!b) continue;
    byBody.set(b, [...(byBody.get(b) ?? []), i.name]);
  }
  const multi = [...byBody.entries()].filter(([, xs]) => xs.length > 1).sort((a, b) => b[1].length - a[1].length);
  console.log(`\n[7] distinct administering bodies with >1 publishable leaf: ${multi.length}`);
  for (const [b, xs] of multi.slice(0, 12)) console.log(`    ${xs.length.toString().padStart(3)}  ${b}`);

  // 8. Application-route inheritance: how many publishable rows share a route
  //    string with another publishable row?
  const byRoute = new Map<string, number>();
  for (const i of pub) {
    const ch = i.application?.channel?.trim();
    if (!ch) continue;
    byRoute.set(ch, (byRoute.get(ch) ?? 0) + 1);
  }
  const shared = [...byRoute.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  const withRoute = pub.filter((i) => i.application?.channel?.trim()).length;
  console.log(`\n[8] publishable rows with an application route: ${withRoute}; ` +
    `distinct routes ${byRoute.size}; routes shared by >1 row: ${shared.length}`);
  for (const [r, n] of shared.slice(0, 8)) console.log(`    ${n.toString().padStart(3)}  ${r.slice(0, 110)}`);

}

main().catch((e) => { console.error(e); process.exit(1); });
