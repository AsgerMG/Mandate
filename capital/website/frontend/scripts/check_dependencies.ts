/**
 * Dependency audit with a REVIEWED exceptions register.
 *
 * FREE. Wraps `npm audit` so CI can fail on what is actionable without going
 * permanently red on what is not.
 *
 * ── Why not just run `npm audit` ──────────────────────────────────────────
 * Three high-severity advisories currently have no fixed release: the Next.js
 * one covers every version up to 16.3.0-preview.7, and npm's suggested "fix"
 * is a downgrade to 9.3.3 — four major versions back, which would break the
 * product to satisfy a scanner. `postcss` and `sharp` are transitive through
 * Next and inherit the same situation.
 *
 * A check that cannot pass is a check people learn to skip, and then it stops
 * catching the ones that DO matter. So unfixable advisories are named here
 * with a reason and a REVIEW-BY DATE, and this script fails if:
 *
 *   * any high/critical advisory appears that is not on the register, or
 *   * an exception is past its review date — because "we will look at it
 *     later" with no date is how a known hole becomes a forgotten one.
 *
 * Run: npx tsx scripts/check_dependencies.ts
 */
import { execSync } from "node:child_process";

interface Exception {
  /** npm package name as it appears in `npm audit --json`. */
  name: string;
  reason: string;
  /** ISO date. Past this, the check FAILS until someone re-reviews. */
  reviewBy: string;
}

/**
 * Accepted, time-boxed. Every entry needs a reason a reviewer can check and a
 * date by which someone must look again.
 */
const EXCEPTIONS: Exception[] = [
  {
    name: "next",
    reason:
      "Advisory range covers all releases up to 16.3.0-preview.7; there is no fixed " +
      "version to move to. npm proposes downgrading to 9.3.3 (four majors back), which " +
      "would break the product. Upgrade as soon as a patched 16.x ships.",
    reviewBy: "2026-09-30",
  },
  {
    name: "postcss",
    reason: "Transitive through next. Resolves when next ships a patched release.",
    reviewBy: "2026-09-30",
  },
  {
    name: "sharp",
    reason:
      "Transitive through next (libvips CVEs). Only reachable via image optimisation, " +
      "which this site does not use on untrusted input — every image is a build-time asset.",
    reviewBy: "2026-09-30",
  },
];

interface AuditVuln { severity: string; via: unknown[] }

function main() {
  let raw = "";
  try {
    raw = execSync("npm audit --omit=dev --json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (err) {
    // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
    raw = (err as { stdout?: string }).stdout ?? "";
  }
  if (!raw.trim()) {
    console.error("could not run npm audit");
    process.exitCode = 1;
    return;
  }

  const report = JSON.parse(raw) as { vulnerabilities?: Record<string, AuditVuln> };
  const vulns = report.vulnerabilities ?? {};
  const serious = Object.entries(vulns)
    .filter(([, v]) => v.severity === "high" || v.severity === "critical");

  const excepted = new Map(EXCEPTIONS.map((e) => [e.name, e]));
  const today = new Date().toISOString().slice(0, 10);
  const problems: string[] = [];

  for (const [name, v] of serious) {
    const ex = excepted.get(name);
    if (!ex) {
      problems.push(`${v.severity.toUpperCase()} ${name} — not on the exceptions register. ` +
        `Upgrade it, or add a documented exception with a review date.`);
    } else if (ex.reviewBy < today) {
      problems.push(`${name} — exception EXPIRED on ${ex.reviewBy}. Re-review: is there a fix now?`);
    }
  }
  // An exception for something no longer flagged is stale bookkeeping; say so,
  // but do not fail on it.
  const flagged = new Set(serious.map(([n]) => n));
  const stale = EXCEPTIONS.filter((e) => !flagged.has(e.name)).map((e) => e.name);

  console.log(`high/critical advisories: ${serious.length}  ` +
    `(${serious.filter(([n]) => excepted.has(n)).length} accepted, ` +
    `${problems.length} needing action)`);
  for (const e of EXCEPTIONS) {
    if (flagged.has(e.name)) console.log(`  accepted until ${e.reviewBy}  ${e.name}`);
  }
  if (stale.length) console.log(`  no longer flagged (exception can be removed): ${stale.join(", ")}`);

  if (problems.length) {
    console.error("\n" + problems.map((p) => `  ${p}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log("\nno unreviewed high or critical advisories");
  }
}

main();
