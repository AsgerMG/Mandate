/**
 * mandate/playbooks/*.md -> lib/mandate/agent/playbooks.generated.ts.
 * FREE. Run after any playbook edit: npx tsx scripts/emit_playbooks.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readPlaybooks, renderGenerated } from "../lib/mandate/agent/playbooksSource";

const out = resolve(__dirname, "../lib/mandate/agent/playbooks.generated.ts");
writeFileSync(out, renderGenerated(readPlaybooks()));
console.log(`wrote ${out}`);
