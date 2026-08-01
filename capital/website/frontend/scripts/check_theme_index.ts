// Fails the build when the generated theme index and the corpus disagree.
//
// relevance.ts no longer reads gates: it indexes every instrument on
// themeIndex.generated.ts. That is what took the per-request payload from
// 4.45 MB to about 1.2 MB, and it is only safe while the artifact matches the
// corpus. A stale one is silent in the worst way — an instrument published
// after the last generation indexes on its name alone and falls under the
// relevance floor, so it simply stops being offered, with nothing to notice it
// by.
//
// Byte-exact against the emitter's own build(), the same shape as
// check_vocabularies.ts: no re-implementation of the rules here, because a
// checker that restates them can agree with itself while both drift from
// relevance.ts.
import { readFileSync } from "node:fs";

async function main() {
  // Unconditionally, not only under NO_PG. The artifact is defined against the
  // committed instrument_terms.json, so a laptop with DATABASE_URL set would
  // otherwise load a different corpus and report permanent false drift.
  delete process.env.DATABASE_URL;

  const { build, OUT } = await import("./emit_theme_index");
  const expected = build();
  let actual = "";
  try {
    actual = readFileSync(OUT, "utf8");
  } catch {
    actual = "";
  }

  if (actual === expected) {
    const n = expected.split("\n").length - 3;
    console.log(`check_theme_index: ok — ${n} instruments indexed`);
    return;
  }

  console.error(
    actual
      ? "check_theme_index: themeIndex.generated.ts is STALE."
      : "check_theme_index: themeIndex.generated.ts is MISSING.",
  );
  console.error("  run: cd website/frontend && npx tsx scripts/emit_theme_index.ts");

  // Name what moved, so the cause is obvious: a corpus publish adds or removes
  // instruments, whereas a change to THEMATIC_FAMILIES/ADMIN_NOISE/STOP/tokens
  // changes the tokens of instruments that are in both.
  const ids = (s: string) =>
    new Set([...s.matchAll(/^ {2}"([^"]+)":/gm)].map((m) => m[1]));
  const before = ids(actual);
  const after = ids(expected);
  const added = [...after].filter((i) => !before.has(i));
  const removed = [...before].filter((i) => !after.has(i));
  if (added.length) console.error(`  ${added.length} new instrument(s), e.g. ${added.slice(0, 3).join(", ")}`);
  if (removed.length) console.error(`  ${removed.length} removed, e.g. ${removed.slice(0, 3).join(", ")}`);
  if (!added.length && !removed.length) {
    console.error("  same instruments, different tokens — a tokenising rule in relevance.ts changed");
  }
  process.exit(1);
}

main();
