// Put the case-board fixtures (lib/bench/board-fixtures.ts) into the bench's
// conversation store, so the Board tab can be seen without a brain turn.
// Free: no model call, nothing leaves the laptop.
//
//   MANDATE_BENCH_DATA=/tmp/bench-fixtures npx tsx scripts/bench_board_fixtures.ts
//   npx tsx scripts/bench_board_fixtures.ts --own-store   # into ~/Mandate-backups/bench
//
// The full page needs no store at all: /bench/board?fixture=forklift
import { BOARD_FIXTURES } from "../lib/bench/board-fixtures";
import { dataRoot, getConversation, saveConversation } from "../lib/bench/store";

if (!process.env.MANDATE_BENCH_DATA && !process.argv.includes("--own-store")) {
  console.error("Set MANDATE_BENCH_DATA to a scratch folder, or pass --own-store to write into your own bench store.");
  process.exit(1);
}
for (const c of Object.values(BOARD_FIXTURES)) {
  if (getConversation(c.id)) { console.log(`kept ${c.id} (already there)`); continue; }
  saveConversation(c);
  console.log(`wrote ${c.id}`);
}
console.log(`store: ${dataRoot()}`);
