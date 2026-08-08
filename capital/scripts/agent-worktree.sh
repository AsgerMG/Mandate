#!/usr/bin/env bash
# Create an isolated git worktree for an agent WITHOUT copying a gigabyte.
#
# A bare worktree of this repo is 67 MB. An agent that then runs `npm ci` adds
# 659 MB of node_modules, and one that copies data/db.sqlite adds 615 MB more.
# Seventeen agents in one session filled a 228 GB disk to 2 GB free.
#
# Nothing about those two directories needs to be per-worktree: node_modules is
# derived from a lockfile the worktree already shares, and db.sqlite is a local
# cache of a corpus that lives in Railway Postgres. So both are symlinked to the
# primary checkout. A worktree made this way costs ~67 MB instead of ~1.3 GB.
#
#   scripts/agent-worktree.sh wsBD-my-workstream [base-branch]
#
# Remove YOUR OWN worktree when YOUR branch merges -- and only your own:
#   git worktree remove --force .claude/worktrees/wsBD-my-workstream
#
# NEVER remove a worktree you did not create. Another agent's worktree may hold
# uncommitted work that exists nowhere else, and --force bypasses git's
# dirty-tree protection silently. On 2026-08-08 an agent force-removed two
# worktrees belonging to other workstreams; the committed work survived only
# because both branches happened to be merged already. Cleaning up someone
# else's tree is not tidiness, it is an unrecoverable delete of work you cannot
# see.
set -euo pipefail

NAME="${1:?usage: agent-worktree.sh <branch-name> [base]}"
BASE="${2:-main}"
ROOT="$(git rev-parse --show-toplevel)"
DEST="$ROOT/.claude/worktrees/$NAME"

if [ -e "$DEST" ]; then
  echo "worktree already exists: $DEST" >&2
  exit 1
fi

git -C "$ROOT" worktree add -b "$NAME" "$DEST" "$BASE"

# node_modules: derived from a lockfile both trees share. A per-worktree copy is
# 659 MB of the same bytes, and `npm ci` takes 25 seconds to produce them.
ln -s "$ROOT/website/frontend/node_modules" "$DEST/website/frontend/node_modules"

# .env.local is gitignored, so a fresh worktree has no credentials and every
# harness in it fails or -- worse -- silently skips. Symlinked rather than
# copied so a rotated key reaches every worktree at once, and so no secret is
# ever duplicated onto disk.
[ -f "$ROOT/.env.local" ] && ln -s "$ROOT/.env.local" "$DEST/.env.local"
[ -f "$ROOT/website/frontend/.env.local" ] && \
  ln -s "$ROOT/website/frontend/.env.local" "$DEST/website/frontend/.env.local"

# The local SQLite corpus is a CACHE of Railway Postgres, not a source of truth.
# Symlinked, so an agent reads the same 615 MB everyone else does.
#
# The trade is real and worth stating: a worktree that WRITES to it writes to
# everyone's. That is correct for reads and for publishing runs, and wrong for
# an experiment that mutates the corpus -- such an agent should copy it
# deliberately and delete the copy, rather than every agent paying 615 MB in
# case one of them needs it.
mkdir -p "$DEST/data"
[ -f "$ROOT/data/db.sqlite" ] && ln -s "$ROOT/data/db.sqlite" "$DEST/data/db.sqlite"

echo "worktree ready: $DEST"
echo "  node_modules, .env.local and data/db.sqlite are SYMLINKS to $ROOT"
echo "  size: $(du -sh "$DEST" 2>/dev/null | cut -f1) (a copied one is ~1.3G)"
echo "  remove with: git worktree remove --force $DEST"
