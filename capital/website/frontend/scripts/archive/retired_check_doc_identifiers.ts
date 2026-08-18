/**
 * A name in code font is a promise that the name exists.
 *
 * FREE — reads the tree. No model calls, no DB, no credentials.
 *
 * ── The defect this closes ─────────────────────────────────────────────────
 *
 * `lib/intelligence/ARCHITECTURE.md` is the document a reader is sent to for
 * what this stack does and what has already been measured. Section 4 of it
 * carried the row:
 *
 *     | Better screen-two questions | ... `SCREEN_FOR_RANKER` defaults OFF and
 *     | stays off |
 *
 * `SCREEN_FOR_RANKER` does not exist. Not as a constant, not as an environment
 * key, not as a string, nowhere in the tree. So the document named a lever that
 * cannot be set, said what its default was, and attached a MEASUREMENT to it —
 * "picks changed on 8 of 12". A reader who wanted to reproduce that number had
 * nothing to set, and a reader who trusted the row concluded a route was closed
 * by an experiment they could not find.
 *
 * That is worse than a stale comment beside code, because there is no code
 * beside it to correct the reader. A doc is read exactly when the code is not.
 *
 * ── The property ───────────────────────────────────────────────────────────
 *
 *   EVERY BACKTICKED ALL-CAPS IDENTIFIER IN `lib/intelligence/*.md` RESOLVES TO
 *   A DECLARED SYMBOL, OR TO AN ENVIRONMENT KEY THE TREE ACTUALLY READS.
 *
 * ALL-CAPS and backticked, because that is the shape this repo uses for a
 * constant or a lever — the two things a reader might go and set. A rule id
 * (`FUND-3`), a prose word and an identifier with a wildcard (`AGENT_SELECT*`)
 * are all excluded by requiring the whole backtick content to be one
 * screaming-snake token: rule ids are already tied to the contracts by
 * `check_contracts.ts`, and a wildcard is a family and not a name.
 *
 * Word-boundary matched, deliberately. `SECTOR_NEUTRAL` does NOT resolve
 * against `SECTOR_NEUTRAL_ARM`, and it should not: a reader who exports the
 * first sets nothing. That prefix defect was live in this same document and was
 * found by this check.
 *
 * ── What counts as resolution, and why it is generous ──────────────────────
 * A declaration in either language, or a bare string literal equal to the name.
 * The string-literal clause is what lets an environment key resolve through
 * this repo's own `depthLever("X")` helper and through a workflow's `env:`
 * block, without this check having to know about either. It is generous on
 * purpose: the question being asked is "does this name exist AT ALL", and a
 * guard that answered a narrower question would start failing on legitimate
 * prose and be turned off.
 *
 * Comments are stripped from the sources first, for the same reason
 * `check_answer_not_reachable` strips them: this repo explains its history at
 * length, so a name that survives only inside an explanation of its own removal
 * is precisely the name a reader cannot use.
 *
 * Prove it can fail:
 *   PROVE=1 npx tsx scripts/check_doc_identifiers.ts
 * which plants `FAKE_LEVER` in the identifier set and requires it to come back
 * unresolved. If the planted name resolves, THIS CHECK has stopped working and
 * it fails for that instead.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

import { code } from "../_import_graph";

/** The frontend is `website/frontend`; the tree is two levels up. */
const FRONTEND = process.cwd();
const REPO = path.resolve(FRONTEND, "..", "..");
const DOCS = path.join(FRONTEND, "lib", "intelligence");

/** Where a name could legitimately live. Extensions rather than directories,
 *  so a source tree reorganised tomorrow is still searched. */
const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs|py|ya?ml|toml|sh|json)$/;

/** Directories that are not ours, or that hold data rather than code. The
 *  corpus JSON under these is tens of megabytes of fund text and would make
 *  every capitalised word in it "resolve". */
const SKIP_DIR = new Set([
  "node_modules", ".next", ".git", "data", "public", "dist", "build",
  "__pycache__", ".venv", "venv", ".claude",
]);

function sources(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (SKIP_DIR.has(name)) continue;
    const p = path.join(dir, name);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) out.push(...sources(p));
    else if (SOURCE_EXT.test(name)) out.push(p);
  }
  return out;
}

/** Python comments, stripped the same way and for the same reason as the
 *  TypeScript ones. Docstrings are left alone — a name inside one is a name a
 *  reader can still act on, because a docstring sits on the thing it describes. */
function pyCode(src: string): string {
  return src.split("\n").map((l) => {
    const i = l.indexOf("#");
    return i === -1 || /["']/.test(l.slice(0, i)) ? l : l.slice(0, i);
  }).join("\n");
}

/** The whole backtick content must be one screaming-snake token. */
const DOC_IDENT = /`([A-Z][A-Z0-9_]*)`/g;
const IS_IDENT = /^[A-Z][A-Z0-9_]{2,}$/;

function docIdentifiers(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const f of readdirSync(DOCS).filter((n) => n.endsWith(".md"))) {
    const full = path.join(DOCS, f);
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(DOC_IDENT)) {
        if (!IS_IDENT.test(m[1])) continue;
        const where = `${path.relative(REPO, full)}:${i + 1}`;
        found.set(m[1], [...(found.get(m[1]) ?? []), where]);
      }
    });
  }
  return found;
}

function main() {
  const wanted = docIdentifiers();
  if (process.env.PROVE) {
    // The planted disaster: a lever named in a doc and existing nowhere, which
    // is the exact state `SCREEN_FOR_RANKER` was found in.
    wanted.set("FAKE_LEVER", ["PROVE=1 (planted)"]);
  }

  if (wanted.size < 5) {
    console.error(`check_doc_identifiers: FAILED — found only ${wanted.size} backticked ` +
      `identifier(s) across ${DOCS}. The extraction has stopped matching and a green ` +
      `result would mean nothing.`);
    process.exit(1);
  }

  const unresolved = new Map<string, string[]>(wanted);
  const resolvedIn = new Map<string, string>();
  // THIS FILE IS NOT EVIDENCE. It quotes the planted name, and it quotes
  // `SCREEN_FOR_RANKER` in the prose explaining why it exists — so a guard that
  // searched its own source would resolve both against itself and could never
  // go red. Same exclusion, for the same reason, as `check_answer_not_reachable`
  // not implicating itself for naming the answer sources.
  const self = path.resolve(process.argv[1] ?? "");
  const files = sources(REPO).filter((f) => f !== self);
  let scanned = 0;
  for (const f of files) {
    if (!unresolved.size) break;
    let src: string;
    try { src = readFileSync(f, "utf8"); } catch { continue; }
    scanned++;
    src = /\.py$/.test(f) ? pyCode(src)
      : /\.(tsx?|jsx?|mjs|cjs)$/.test(f) ? code(src) : src;
    for (const name of [...unresolved.keys()]) {
      // Declared, or named as a key. `\b` is what stops SECTOR_NEUTRAL from
      // resolving against SECTOR_NEUTRAL_ARM.
      const re = new RegExp(
        `(?:export\\s+(?:const|let|var|function|type|interface|enum|class|abstract\\s+class)\\s+${name}\\b)` +
        `|(?:\\b(?:const|let|var|def|class)\\s+${name}\\b)` +
        `|(?:process\\.env\\.${name}\\b)` +
        `|(?:["'\`]${name}["'\`])` +
        // A key, wherever it is written. Not anchored to the line start: a
        // workflow may write an env block inline (`env: { X: '1' }`), and an
        // anchored pattern reported a real key as fictional for that alone.
        `|(?:\\b${name}\\s*[:=])`,
        "m");
      if (re.test(src)) {
        unresolved.delete(name);
        resolvedIn.set(name, path.relative(REPO, f));
      }
    }
  }

  if (scanned < 100) {
    console.error(`check_doc_identifiers: FAILED — scanned only ${scanned} source file(s). ` +
      `The tree walk is broken and every identifier would report as unresolved.`);
    process.exit(1);
  }

  if (process.env.PROVE) {
    const planted = unresolved.has("FAKE_LEVER");
    console.log(`  PROVE: ${wanted.size - 1} identifier(s) read from the docs, ` +
      `${scanned} source file(s) searched`);
    if (!planted) {
      console.error(`\ncheck_doc_identifiers: FAILED — the planted FAKE_LEVER RESOLVED. ` +
        `A name that exists nowhere in the tree came back as found, so this check ` +
        `cannot fail and is not a guard.`);
      process.exit(1);
    }
    console.error(`\n  PROVE: FAKE_LEVER came back unresolved, as it must. What follows is ` +
      `the red this check produces.`);
  }

  if (unresolved.size) {
    console.error(`\ncheck_doc_identifiers: FAILED — ${unresolved.size} identifier(s) named ` +
      `in the docs exist nowhere in the tree:\n`);
    for (const [name, where] of unresolved) {
      console.error(`  \`${name}\`  ${where.join(", ")}`);
    }
    console.error(`\nA name in code font is a promise that a reader can go and find it. Either`);
    console.error(`the name is wrong — a prefix of the real one, or the name it had before a`);
    console.error(`rename — or the thing it names was deleted and the sentence around it,`);
    console.error(`including any measurement attached to it, no longer describes anything.`);
    console.error(`A dead name belongs in prose, not in code font.\n`);
    process.exit(1);
  }

  console.log(`check_doc_identifiers: ok — ${wanted.size} identifier(s) in ` +
    `lib/intelligence/*.md, every one resolving to a real symbol or key ` +
    `(${scanned} source files searched).`);
}

main();
