// Country name -> ISO2, and nothing else.
//
// This lived in corpus.ts, which reads the filesystem and imports `pg`. types.ts
// needs toIso2 for its region options, panelReport.tsx is a "use client"
// component that imports a VALUE from types.ts, and so the whole server-side
// corpus layer -- fs, pg, dns -- was pulled into the browser bundle. The
// production build failed with "Module not found: Can't resolve 'dns'" and had
// been failing before anyone noticed, because every check we run is either
// tsc (which erases type-only edges and does not bundle) or a tsx script (which
// runs in Node, where fs and pg resolve fine).
//
// So this is a LEAF: pure data and one pure function, no imports at all. Nothing
// a client component reaches through may import a server module, and the way to
// guarantee that is for the shared thing to depend on nothing.

// Country name (as the web search returns it) → ISO2, to disambiguate matches.
// Only the European countries in scope; anything else stays undefined and the
// match falls back to name-only scoring.
const COUNTRY_ISO: Record<string, string> = {
  austria: "AT", belgium: "BE", bulgaria: "BG", croatia: "HR", cyprus: "CY",
  czechia: "CZ", "czech republic": "CZ", denmark: "DK", estonia: "EE",
  finland: "FI", france: "FR", germany: "DE", greece: "GR", hungary: "HU",
  iceland: "IS", ireland: "IE", italy: "IT", latvia: "LV", lithuania: "LT",
  luxembourg: "LU", malta: "MT", netherlands: "NL", "the netherlands": "NL",
  norway: "NO", poland: "PL", portugal: "PT", romania: "RO", slovakia: "SK",
  slovenia: "SI", spain: "ES", sweden: "SE", switzerland: "CH",
  "united kingdom": "GB", uk: "GB", "great britain": "GB", britain: "GB",
  // Enlargement and neighbourhood countries. Present in the NUTS
  // classification and in the corpus, and absent here until check_regions
  // started asserting that every country the corpus holds can actually be
  // resolved. Each missing name failed the same silent way: the region
  // question simply stopped being asked, for that country only.
  liechtenstein: "LI", turkey: "TR", "türkiye": "TR", serbia: "RS",
  "north macedonia": "MK", albania: "AL", montenegro: "ME",
  "bosnia and herzegovina": "BA", moldova: "MD", ukraine: "UA",
  kosovo: "XK",
};

/** Every spelling of a country this corpus recognises. Exported so a check can
 *  ask "does this text name a country?" against the SAME vocabulary the
 *  matcher uses, rather than against a second list that drifts from it. */
export function countryNames(): string[] {
  return Object.keys(COUNTRY_ISO);
}

export function toIso2(country?: string): string {
  if (!country) return "";
  const c = country.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(c)) return c.toUpperCase();
  return COUNTRY_ISO[c] ?? "";
}
