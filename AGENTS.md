# Repository guidance

The active Thoughts app is in `thoughts-mvp/`. Read `thoughts-mvp/AGENTS.md` and the relevant app instructions before making changes. Root `src/` is the earlier Vue prototype; preserve it unless explicitly asked to change it.

`master` is the only permanent branch and the source of builds and deployments. Use short-lived `codex/*` or `feature/*` branches for work, merge into `master`, then delete merged working branches. Do not recreate permanent `main` or `develop` branches. Never delete a branch with unmerged work during cleanup.

Release and deployment instructions are in `thoughts-mvp/README-PUBLISH.md`. OAuth container publishing does not automatically redeploy the VPS; keep its existing sites and services isolated.
