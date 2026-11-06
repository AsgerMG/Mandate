cd /Users/asgermollergrimberg/Wincent/.claude/worktrees/wsCQ-real-founder/website/frontend
m () { name=$1; shift; echo "=== $name ==="; env "$@" npx tsx scripts/measure_recall.ts > /tmp/wscq/$name.txt 2>&1 || echo "FAILED $name"; grep -aE "ranker:|in pool|EXACT scheme|same REGIME" /tmp/wscq/$name.txt; }
a () { name=$1; shift; echo "=== $name ==="; env "$@" npx tsx scripts/_wsci_autopsy.ts > /tmp/wscq/$name.txt 2>&1 || echo "FAILED $name"; grep -aE "ranker:|^EXACT@5|ORACLE CAP|^1  |^2  |^3  |^4  " /tmp/wscq/$name.txt; }
OLDARM="IDENTITY=anonymous OWN_HISTORY=withheld CAPITAL=pinned ANSWERS=off"
echo "=== FLOOR_new ==="; npx tsx scripts/check_recall_floor.ts > /tmp/wscq/FLOOR_new.txt 2>&1; grep -aE "ranker:|ok  |FAIL" /tmp/wscq/FLOOR_new.txt
m HOLD_old SPLIT=holdout N=300 $OLDARM
m HOLD_new SPLIT=holdout N=300
a AUT_hold_old SPLIT=holdout N=250 $OLDARM
a AUT_hold_new SPLIT=holdout N=250
echo "=== HOLD DONE ==="
