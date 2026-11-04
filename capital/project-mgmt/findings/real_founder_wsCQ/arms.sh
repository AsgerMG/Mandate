set -e
cd /Users/asgermollergrimberg/Wincent/.claude/worktrees/wsCQ-real-founder/website/frontend
run () { name=$1; shift; echo "=== $name ==="; env "$@" SPLIT=tune N=300 SEED=20260806 npx tsx scripts/measure_recall.ts > /tmp/wscq/$name.txt 2>&1 || echo "FAILED $name"; grep -E "ranker:|in pool|EXACT scheme|same REGIME" /tmp/wscq/$name.txt; }
run A0_old      IDENTITY=anonymous OWN_HISTORY=withheld CAPITAL=pinned   ANSWERS=off
run A1_capital  IDENTITY=anonymous OWN_HISTORY=withheld CAPITAL=withheld ANSWERS=off
run A2_identity IDENTITY=real      OWN_HISTORY=withheld CAPITAL=withheld ANSWERS=off
run A3_new      IDENTITY=real      OWN_HISTORY=withheld CAPITAL=withheld ANSWERS=strict
run LEAK        IDENTITY=real      OWN_HISTORY=corpus   CAPITAL=withheld ANSWERS=strict
