// Every test run gets its own bench store root: a test that writes a bench
// conversation, a review set or a feedback item writes HERE, never into the
// owner's ~/Mandate-backups/bench (the app shows that folder). A test may stub
// its own; lib/bench/store.ts refuses the real folder under vitest regardless.
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.MANDATE_BENCH_DATA = mkdtempSync(path.join(os.tmpdir(), "mandate-bench-vitest-"));
