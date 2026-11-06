// wsIU — build a /brief/preview fixture out of the REAL Norwegian rows so the
// rename can be LOOKED AT. Free, offline, writes only a scratch fixture.
//   ARM=A|C OUT=<path> npx tsx scripts/_wsiu_fixture.ts
delete process.env.DATABASE_URL;
import { writeFileSync, readFileSync } from "node:fs";

const NAMES: Record<string, string> = {
  innovasjon_norge_grant_startup: "Oppstartstilskudd",
  innovasjon_norge_grant_innovation: "Innovasjonstilskudd",
  innovasjon_norge_grant_regional: "Distriktsutviklingstilskudd",
  innovasjon_norge_grant_cluster: "Klynger og nettverk",
  innovasjon_norge_grant_international: "Internasjonale tilskuddsprogrammer",
  innovasjon_norge_grant_sector: "Næringsspesifikke utviklingstiltak",
  innovasjon_norge_loan_lowrisk: "Lavrisikolån",
  innovasjon_norge_loan_risk: "Risikolån og garantier",
};

async function main() {
  const arm = process.env.ARM ?? "A";
  const { publishableInstruments } = await import("../lib/intelligence/corpus");
  const { distinguishRowNames, nameRowsAsDoors, displayInstitutionName } =
    await import("../lib/intelligence/shortlist");
  const { instrumentLink } = await import("../lib/intelligence/instrumentLink");
  const pool = publishableInstruments().filter((i) => i.country === "NO"
    && i.id.startsWith("innovasjon_norge"));
  const rows = pool.map((i) => ({
    channel: i.sourceFamilyBucket ?? i.id,
    instrument: arm === "A" ? i.name : (NAMES[i.id] ?? i.name),
    ticket: "", usedInField: false, fit: "", instrumentId: i.id, country: i.country,
    capitalType: i.capitalType,
    administeringBody: (arm === "C" && NAMES[i.id]) ? "Innovasjon Norge" : i.administeringBody,
    administeringBodyShare: i.administeringBodyShare, schemeCode: i.schemeCode,
    applicationUrl: i.applicationUrl, deliveryRegion: i.deliveryRegion,
    schemeOperators: i.schemeOperators, description: i.description,
  })) as any[];
  distinguishRowNames(rows); nameRowsAsDoors(rows);

  const fixture = JSON.parse(readFileSync("lib/intelligence/__fixtures/report.json", "utf8"));
  const proto = fixture.institutions[0];
  fixture.institutions = rows.slice(0, 6).map((r, n) => ({
    ...proto,
    institution: displayInstitutionName(r),
    instrumentId: r.instrumentId,
    channel: r.channel,
    supportType: r.capitalType === "loan" ? "Loan"
      : r.capitalType === "blended" ? "Blended finance" : "Grant",
    country: "NO",
    ticket: proto.ticket,
    link: instrumentLink(r) ?? null,
    schemeCode: null, schemeOperators: null, familyName: undefined,
    descriptor: proto.descriptor, whyEligible: proto.whyEligible,
    nextStep: proto.nextStep, comparableFirms: [], eligibility: proto.eligibility,
    rank: n + 1,
  }));
  writeFileSync(process.env.OUT ?? "/dev/stdout", JSON.stringify(fixture, null, 1));
  for (const i of fixture.institutions) console.log(" ", i.institution, "|", i.link?.label ?? "NO LINK");
}
main();
