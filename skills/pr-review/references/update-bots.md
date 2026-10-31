# Update bots

Renovate bumps dependencies, and the repo-sync App copies shared files from zgeoff/tools into each
repo. Neither gets `hq review`: a repo-sync PR was already reviewed in zgeoff/tools.

## Renovate PRs

Renovate merges these itself on green CI: patch, security and minor updates, the weekly lock-file
refresh, `@zgeoff/*` bumps, and bumps of the zgeoff/tools sync ref. Majors of other packages come in
a weekly batch: review the batch in one sitting, each PR through `hq review`.

## Repo-sync PRs

1. From this skill's folder, run `scripts/sync-pr.sh <repo> <pr>` (repo without `zgeoff/`). It
   prints `ok: ...`, or `no` with the first failing reason.
2. On `ok`, merge on green CI.
3. If the reason is a local edit the repo keeps, compare the PR's diff with the upstream change it
   copies:
   - Merge it (your Repo sync grant covers this) when every line it removes or changes, upstream
     also removes or changes, and every line only the repo's copy has survives.
   - If it would lose a local edit, message `z-stu` the PR and the lines. `z-stu` decides.
4. Any other reason: it waits for the owner's lgtm; file it with `hq unblock add` as holds.md says.

## The daily check of open Renovate PRs

Some PRs Renovate should have merged stay open, such as one whose CI went green late. Run this
check in your first turn after 07:00 Australia/Sydney each day. Save the date of the last check in
your state file, so a new session can tell whether today's has run: when the saved date is not
today, run it now. List them:

```sh
gh search prs --owner zgeoff --state open --author app/zgeoff-renovate --limit 200
```

Renovate runs as the `zgeoff-renovate` app, so `--author app/renovate` finds nothing.

For each, the first that fits:

- **Archived repo:** leave it. For a security update, ask the owner through `z-stu` whether to
  unarchive.
- **A major of another package:** leave it for the weekly batch.
- **CI running:** leave it for tomorrow.
- **A kind Renovate merges, CI green:** for a zgeoff/cloud PR touching `nixos/` or
  `packages/topology/`, run the NixOS check first. Then squash-merge it.
- **A kind Renovate merges, CI red:** message `z-delivery` the PR to launch a fix, and merge once
  green.

Post the counts, with "left" as every PR left open:

```sh
hq news add --topic merge --text "Renovate daily check: <n> merged, <n> sent to agents, <n> left"
```
