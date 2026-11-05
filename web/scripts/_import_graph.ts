// WHAT A REQUEST CAN REACH, derived from the import graph. ONE derivation.
//
// ── Why this is a module and not a second copy ─────────────────────────────
// `check_answer_not_reachable.ts` has asked "what can a founder's request
// reach" since it was written, and it answers it by walking imports from
// `pipeline.ts`. `check_check_reachability.ts` asks the same question of a
// different set of modules — the ones exporting rule ids — and if it walked the
// graph itself there would be two derivations of "reachable", agreeing today.
// This repo's own record on that is unambiguous: two copies of a number is the
// defect that put three independent fives in one funnel.
//
// So the walk lives here and both guards read it. Neither owns it, and a fix to
// the resolver reaches both.
//
// ── What it does NOT do ────────────────────────────────────────────────────
// It resolves relative specifiers and the `@/` alias, and nothing else. A
// bare specifier is a package, and no package in `node_modules` is a module of
// ours that could hold a rule or read an answer key. A dynamic import whose
// specifier is computed rather than literal is invisible to it, and that is
// stated rather than papered over: this is a static reachability derivation, so
// it is a LOWER bound on what a request can reach, which is the safe direction
// for a guard that fails on reach.
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

/** Every source under a root, tests excluded — a test naming an answer key, or
 *  calling a check, is how those guards are written, and it runs no founder's
 *  request. */
export function walk(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (name === "node_modules" || name === ".next") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Comments stripped: this repo explains its defects in prose, and a check
 *  that cannot tell an explanation from an implementation would force everyone
 *  to stop explaining. What survives is code. */
export function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => {
      const i = l.search(/(^|[^:'"`\\])\/\//);
      return i === -1 ? l : l.slice(0, l.indexOf("//", i));
    })
    .join("\n");
}

/** Resolve one specifier to a file we know about, or null.
 *
 *  `root` is what `@/` means — the Next.js path alias, which every route file
 *  uses and no module under `lib/` can be reached from without. A resolver that
 *  handled only `./` would report an API route as importing nothing at all,
 *  and a guard built on that would be green by blindness. */
export function resolveImport(
  fromFile: string, spec: string, known: Set<string>, root: string,
): string | null {
  const target = spec.startsWith("@/")
    ? path.resolve(root, spec.slice(2))
    : path.resolve(path.dirname(fromFile), spec);
  for (const c of [`${target}.ts`, `${target}.tsx`, path.join(target, "index.ts")]) {
    if (known.has(c)) return c;
  }
  return null;
}

/** Every module reachable from any of `entries`, transitively. */
export function reachable(
  entries: string[], known: Set<string>, root: string,
): Set<string> {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    let src: string;
    try { src = code(readFileSync(f, "utf8")); } catch { continue; }
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([.@][^"']+)["']/g)) {
      const dep = resolveImport(f, m[1], known, root);
      if (dep && !seen.has(dep)) queue.push(dep);
    }
  }
  return seen;
}
