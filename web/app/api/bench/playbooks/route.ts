// LOCAL-ONLY (lib/bench/guard.ts). Read-only view of the brains' playbooks
// (mandate/playbooks/**.md) with when each last changed and how many commits
// shaped it, so the owner sees a brain grow. GET lists; ?file= reads one.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fail, guard, json } from "@/lib/bench/guard";
import type { Brain } from "@/lib/bench/model";
import { mtimeOf, readRepoFile, repoRoot } from "@/lib/bench/store";

export const dynamic = "force-dynamic";
const FILE_RE = /^(interviews\/)?[a-z0-9][a-z0-9_.-]*\.md$/;

/** Which brain reads a playbook: by name (policy-*, regina* for Regina;
 *  funding-*, wincent* for Wincent); the rest is shared method. */
function brainsOf(file: string): Brain[] {
  if (/^(policy-|regina)|interviews\/regina/.test(file)) return ["regina"];
  if (/^(funding-|wincent)|interviews\/wincent/.test(file)) return ["wincent"];
  return ["wincent", "regina"];
}

const git = (args: string[]) => execFileSync("git", args, { cwd: repoRoot(), encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });

/** Commit dates of a playbook, and whether it has changes not yet committed
 *  (an accepted proposal, say). */
function history(rel: string): { last_commit: string | null; commits: number; dirty: boolean } {
  try {
    const dates = git(["log", "--format=%cI", "--", rel]).split("\n").filter(Boolean);
    const dirty = git(["status", "--porcelain", "--", rel]).trim() !== "";
    return { last_commit: dates[0] ?? null, commits: dates.length, dirty };
  } catch { return { last_commit: null, commits: 0, dirty: false }; }
}

export async function GET(req: Request): Promise<Response> {
  const blocked = guard(req);
  if (blocked) return blocked;
  const base = path.join(repoRoot(), "mandate/playbooks");
  const file = new URL(req.url).searchParams.get("file");
  if (file !== null) {
    if (!FILE_RE.test(file)) return fail("bad file");
    const md = readRepoFile(path.join(base, file));
    if (md === null) return fail("no such playbook", 404);
    return json({ file, markdown: md });
  }
  const files = [
    ...readdirSync(base).filter((f) => FILE_RE.test(f)),
    ...(() => { try { return readdirSync(path.join(base, "interviews")).filter((f) => f.endsWith(".md")).map((f) => `interviews/${f}`); } catch { return []; } })(),
  ];
  const playbooks = files.map((f) => {
    const abs = path.join(base, f);
    const md = readRepoFile(abs) ?? "";
    return {
      file: f, brains: brainsOf(f), title: md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? f,
      lines: md.split("\n").length, modified: mtimeOf(abs), ...history(`mandate/playbooks/${f}`),
    };
  });
  const changed = (p: (typeof playbooks)[number]) => (p.dirty ? p.modified : p.last_commit) ?? "";
  playbooks.sort((a, b) => changed(b).localeCompare(changed(a)));
  return json({ playbooks });
}
