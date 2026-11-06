delete process.env.DATABASE_URL;
(async () => {
const { publishableInstruments } = await import("../../lib/intelligence/corpus");
const { distinguishRowNames, nameRowsAsDoors, displayInstitutionName } = await import("../../lib/intelligence/shortlist");
const { instrumentLink } = await import("../../lib/intelligence/instrumentLink");
const pool = publishableInstruments();
const NAMES: Record<string,string> = {
  innovasjon_norge_grant_startup: "Oppstartstilskudd",
  innovasjon_norge_grant_innovation: "Innovasjonstilskudd",
  innovasjon_norge_grant_regional: "Distriktsutviklingstilskudd",
  innovasjon_norge_grant_cluster: "Klynger og nettverk",
  innovasjon_norge_grant_international: "Internasjonale tilskuddsprogrammer",
  innovasjon_norge_grant_sector: "Næringsspesifikke utviklingstiltak",
  innovasjon_norge_loan_lowrisk: "Lavrisikolån",
  innovasjon_norge_loan_risk: "Risikolån og garantier",
};
for (const arm of ["A: production","B: name only","C: name + administeringBody"] as const) {
  const rows = pool.filter(i => i.country === "NO").map(i => ({
    channel: i.sourceFamilyBucket ?? i.id,
    instrument: arm.startsWith("A") ? i.name : (NAMES[i.id] ?? i.name),
    ticket: "", usedInField: false, fit: "", instrumentId: i.id, country: i.country,
    capitalType: i.capitalType,
    administeringBody: (arm.startsWith("C") && NAMES[i.id]) ? "Innovasjon Norge" : i.administeringBody,
    administeringBodyShare: i.administeringBodyShare, schemeCode: i.schemeCode,
    applicationUrl: i.applicationUrl, deliveryRegion: i.deliveryRegion, schemeOperators: i.schemeOperators,
  })) as any[];
  distinguishRowNames(rows); nameRowsAsDoors(rows);
  console.log("\n=== ARM", arm);
  for (const r of rows) if (String(r.instrumentId).startsWith("innovasjon")) {
    const l = instrumentLink(r);
    console.log("   ", String(r.instrumentId).padEnd(38), JSON.stringify(displayInstitutionName(r)).padEnd(40), l ? `${l.label} -> ${l.url}` : "NO LINK");
  }
}
})();

export {};
