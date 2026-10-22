# update bots

Renovate PRs, repo-sync PRs, and the daily sweep.

## Renovate

Renovate merges its own patch, security, minor and weekly lock-file PRs on green CI, and every bump
of the owner's own packages (`@zgeoff/*` and the tools sync ref), as the shared preset in
zgeoff/tools sets it. Those get no review. Majors of anyone else's packages come in a weekly batch:
take the batch in one sitting, each PR with the normal review.

## Repo-sync PRs

A repo-sync PR copies text already reviewed in zgeoff/tools, so it skips noslop and merges on green
CI once every file it changes is a synced path, or a retired one it removes:
`scripts/sync-pr.sh <repo> <pr>` prints `ok`. Don't run `hq review` on it.

When it prints `no` because the repo keeps a local edit, read the diff against the upstream change
in zgeoff/tools. When every line it removes or changes is one the upstream change removes or
changes, and each line only the repo's copy has stays, it merges under your Repo sync grant. When it
would drop or overwrite a local edit, send it to `z-stu`, which decides. For any other `no`, it
waits for the owner's lgtm, as the holds reference says.

## The daily sweep

Once a day, list every open update-bot PR across zgeoff with
`gh search prs --owner zgeoff --state open --author app/renovate --limit 200`, since some PRs that
Renovate merges itself stay open. For each one:

- **One of those kinds, CI green:** squash-merge it, with no review. A zgeoff/cloud one that changes
  `nixos/` or `packages/topology/` needs its NixOS check first.
- **One of those kinds, CI red:** send it to `z-delivery`, which launches an agent to make it green;
  merge it once CI is green.
- **A major of anyone else's package:** leave it open for the weekly batch.
- **A PR in an archived repo:** leave it. Unarchiving a repo is the owner's choice; ask him when it
  can't wait.

Then post one line with the counts:
`hq news add --topic merge --text "update-bot sweep: <n> merged, <n> sent to agents, <n> left for review"`.
