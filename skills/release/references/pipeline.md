# pipeline

How zgeoff/cloud's `release-check` opens bump PRs, and how you take one that needs review.

## release-check

zgeoff/cloud's `release-check` runs every 6 hours, once in the early Sydney morning. It opens a bump PR for each
of atc, imp, nixie and auto-mode whose pin trails its newest release, and `release-bump-merge`
merges the ones that need no review once their checks pass. A merged nixie bump deploys by itself
through `deploy-prod`. An atc, imp or auto-mode bump still needs your host switch or image build:
switch to a new agent image with `bun run ops:switch-agent-image -- <image>` in `~/projects/cloud`.
tools has no bump job.

From 06:00 Sydney, check what the morning pipeline run landed. When it failed or missed something,
fix it, and deploy by hand from 07:00, live and checked by 08:00.

## Bump PRs

`release-check` labels a bump `needs-review` when it is a major update, a minor update to a 0.x
release, or carries a flag such as `migrations` or `sandbox-images-changed`, and leaves it open.

1. Send it to `z-review`: "Review the bump: cloud#<n>." `z-review` reviews it and merges it once
   `hq review gate` exits 0, then tells you.
2. Before the step that migrates state, such as impd's database, back that state up.
3. Roll it out by the hard rules in `SKILL.md`, and record the PR and run links on the release's issue.

Put it to the owner as a decision only when a finding needs his choice, or a migration deletes or
rewrites existing data. A migration that only adds or fills in data needs no question: back up
first, and ship it.
