import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, ".") } },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Only the modules these tests are actually about. Reporting coverage
      // across the whole app would produce a big number that means nothing —
      // most of it is React and prompt strings that a unit test cannot judge.
      include: [
        "lib/intelligence/verdict.ts",
        "lib/intelligence/sanitize.ts",
        "lib/intelligence/watchOnly.ts",
        "lib/intelligence/cost.ts",
        "lib/intelligence/vocabulary.ts",
      ],
      reporter: ["text-summary"],
      // A floor, not a target. Set just under what the suite currently
      // achieves so it catches deletion of tests, without inviting anyone to
      // write filler to hit a number.
      thresholds: { lines: 70, functions: 70 },
    },
  },
});
