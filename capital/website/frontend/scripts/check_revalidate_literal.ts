// A Next segment config must be a LITERAL, and it must agree with the constant
// it mirrors.
//
// `export const revalidate = CORPUS_REVALIDATE_SECONDS` looks like the clean
// thing to write and fails the entire production build:
//
//     ⨯ Invalid segment configuration export detected.
//
// Next reads these exports by static analysis before any module executes, so an
// imported constant is not a value it can see. The failure names no file, and
// three pages carried the same line — layout, home and /about — so fixing two
// of them left the build just as broken with an identical message.
//
// It reached main and every Vercel deploy failed until someone read the logs.
// So the rule is asserted rather than remembered, from both ends:
//
//   1. every segment config in app/ is a literal — the thing Next requires;
//   2. every `revalidate` literal equals CORPUS_REVALIDATE_SECONDS — because a
//      literal that has silently drifted from the constant it mirrors is a
//      cache lifetime nobody chose.
//
// The second half is the point. Inlining a literal to satisfy a build is how
// the value and its documented source come apart; this makes them come apart
// loudly instead.
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

import { CORPUS_REVALIDATE_SECONDS } from "../lib/corpusFigures";

// This check reads SOURCE TEXT and one compile-time constant. It opens no
// database and asks the corpus nothing, so it loaded credentials it never used
// and reached DATABASE_URL through corpusFigures.ts, whose loader sits in a
// function this file never calls.
//
// Destroying the variable rather than declaring it is the stronger of the two
// statements check_env_loader accepts, and it is the true one here: the run is
// pinned offline instead of merely expected to stay that way. It also keeps the
// check runnable on a pull request with no credentials, which a `requireCredentials`
// declaration would not.
delete process.env.DATABASE_URL;

const APP = path.join(process.cwd(), "app");
const SEGMENT_KEYS = [
  "revalidate", "dynamic", "runtime", "fetchCache",
  "preferredRegion", "dynamicParams", "maxDuration",
];
// What Next can evaluate statically: a number, a quoted string, or a boolean.
const LITERAL = /^\s*(-?[\d_]+|"[^"]*"|'[^']*'|true|false)\s*$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(tsx?|jsx?)$/.test(entry) ? [full] : [];
  });
}

const problems: string[] = [];
for (const file of walk(APP)) {
  const rel = path.relative(process.cwd(), file);
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const m = line.match(/^export\s+const\s+(\w+)\s*=\s*([^;]+);/);
    if (!m || !SEGMENT_KEYS.includes(m[1])) return;
    const [, key, rawValue] = m;
    const value = rawValue.trim();
    if (!LITERAL.test(value)) {
      problems.push(
        `  ${rel}:${i + 1}\n      export const ${key} = ${value};\n` +
        `      Next evaluates segment config statically, so this is not a value it\n` +
        `      can read. Inline the literal and note the constant in a comment.`);
      return;
    }
    if (key === "revalidate" && Number(value.replace(/_/g, "")) !== CORPUS_REVALIDATE_SECONDS) {
      problems.push(
        `  ${rel}:${i + 1}\n      export const revalidate = ${value};\n` +
        `      but CORPUS_REVALIDATE_SECONDS is ${CORPUS_REVALIDATE_SECONDS}. The literal\n` +
        `      exists because Next demands one — it must still agree with the constant\n` +
        `      it mirrors, or the cache lifetime is one nobody chose.`);
    }
  });
}

if (problems.length) {
  console.error("check_revalidate_literal: FAILED\n");
  console.error(problems.join("\n\n"));
  console.error("\n  Every Vercel deploy fails on the first of these, naming no file.");
  process.exit(1);
}
console.log(`check_revalidate_literal: ok — every segment config in app/ is a ` +
  `literal, and every revalidate equals CORPUS_REVALIDATE_SECONDS (${CORPUS_REVALIDATE_SECONDS}).`);
