cd /Users/asgermollergrimberg/Wincent/.claude/worktrees/wsCQ-real-founder/website/frontend
m () { name=$1; shift; echo "=== $name ==="; env "$@" npx tsx scripts/measure_recall.ts > /tmp/wscq/$name.txt 2>&1 || echo "FAILED $name"; grep -aE "ranker:|in pool|EXACT scheme|same REGIME" /tmp/wscq/$name.txt; }
a () { name=$1; shift; echo "=== $name ==="; env "$@" npx tsx scripts/_wsci_autopsy.ts > /tmp/wscq/$name.txt 2>&1 || echo "FAILED $name"; grep -aE "ranker:|^EXACT@5|ORACLE CAP|^1  |^2  |^3  |^4  " /tmp/wscq/$name.txt; }
OLDARM="IDENTITY=anonymous OWN_HISTORY=withheld CAPITAL=pinned ANSWERS=off"

m S7_new   SPLIT=tune N=300 SEED=7
m S99_new  SPLIT=tune N=300 SEED=99
m S7_old   SPLIT=tune N=300 SEED=7  $OLDARM
m S99_old  SPLIT=tune N=300 SEED=99 $OLDARM
a AUT_tune_old SPLIT=tune N=250 $OLDARM
a AUT_tune_new SPLIT=tune N=250
echo "=== TIERS_old ==="; env $OLDARM SPLIT=tune N=25 npx tsx scripts/_wscm_tiers.ts > /tmp/wscq/TIERS_old.txt 2>&1; grep -aE "ranker:|usedInField|tier 1" /tmp/wscq/TIERS_old.txt
echo "=== TIERS_new ==="; SPLIT=tune N=25 npx tsx scripts/_wscm_tiers.ts > /tmp/wscq/TIERS_new.txt 2>&1; grep -aE "ranker:|usedInField|tier 1" /tmp/wscq/TIERS_new.txt
echo "=== ALL DONE ==="
