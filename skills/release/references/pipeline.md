# Bump PRs

zgeoff/cloud pins each service's release (atc, imp, nixie, auto-mode) in
`scripts/release/release-registry.ts`. A bump PR moves one pin to the newest release.

A merged nixie bump deploys by itself, so back up any database it migrates before `z-review` merges
it.

## How they open and merge

- `release-check` runs every 6 hours at :41 UTC (18:41 UTC is Sydney's early morning) and opens a
  bump PR per service whose pin trails.
- `release-bump-merge` merges each `auto-merge` bump once checks pass.
- A nixie bump deploys through `deploy-prod`. An atc, imp or auto-mode bump is live only once you
  roll it out under SKILL.md's Hard rules; for a new agent image, run
  `bun run ops:switch-agent-image -- <image>` in `~/projects/cloud`.

From 06:00 Sydney, check the early-morning run and its PRs. A release is missed when a service's
newest release is newer than its pin with no bump PR open. If the run failed or missed one, fix it
or open the PR by hand, deploy by hand, and have it live and checked by 08:00.

## A bump that needs review

`release-check` labels a bump `needs-review` for a major, a minor on 0.x, or a release labelled
risky, such as `migrations` or `sandbox-images-changed`.

1. Read the body and its migrations. One that deletes or rewrites data goes to `z-triage` as a
   decision, with your recommendation; wait for the answer.
2. Back up any database it migrates, as SKILL.md's Risky migrations says.
3. Message `z-review`: "Review the bump: cloud#<n>." It tells you once merged.
4. Roll it out. For nixie, watch the `deploy-prod` run go green.
5. Comment the bump PR and deploy run on any Linear issue tracking the release.
