#!/bin/sh
# Vercel's "Ignored Build Step" (vercel.json ignoreCommand, capped at 256
# characters, which is why it lives here). Exit 0 = skip the build, 1 = build.
#  - Only main deploys: a branch name with a slash (dependabot/...) escaped the
#    git.deploymentEnabled '*' pattern on 2026-11-09.
#  - Compare with the LAST DEPLOYED commit, not HEAD^: a push of several
#    commits whose last one touches no site path was skipped whole.
#  - If that commit is not in the clone, build (the safe direction).
[ "$VERCEL_GIT_COMMIT_REF" = main ] || exit 0
P=${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}
git cat-file -e "$P^{commit}" 2>/dev/null || exit 1
git diff --quiet "$P" HEAD -- . ../capital/website/build ../capital/ETL/lib ../capital/reference ../mandate/embedding ../mandate/vocabulary ../mandate/profile
