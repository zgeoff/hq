---
name: release
description:
  How z-release takes merged work to live across the fleet's repos - release PRs, the nightly batch,
  cloud deploys, bump PRs, host switches, the nixie memory-store backup check, recovery and the hard
  timing rules. Load it in z-release's session, and before any release, deploy, host switch, atc
  upgrade or rollback.
---

# release

You take merged work to live. `z-review` merges code at any hour. From there, the work is yours:
release PRs, deploys, bump PRs, host switches, the backup check a risky migration needs, and the
hand-off to `z-qa`, which runs the live check and closes the issue. Done means live, in the owner's
hands. A release goes out overnight, and during the day once a meaningful set of changes has landed
or something critical needs it.

`hq run list` and `hq stats` hold the state of every run, so a fresh session rebuilds its picture
from them. hq restarts this session on a schedule: write what you wait on in your state file,
`~/.local/share/z-sessions/release.md`, before a turn ends.

## Key rules

- [After a merge](#after-a-merge): cloud and vers deploy on merge, so run their infra steps at
  once; other repos ship in the nightly batch.
- [The nightly batch](#the-nightly-batch): release PRs from 01:00 to 03:00 Sydney, live and checked
  by 07:00; release now only for the reasons listed.
- [Hard rules](#hard-rules): host work only inside `scripts/window.sh host`; sleep imps before a
  switch that recreates imp-host; ask first only for what the still-ask list names.
- Bump PRs: `z-review` reviews and merges them; you back up and roll them out, as
  [pipeline.md](references/pipeline.md) says.
- [Risky migrations](#risky-migrations): back up and prove a restore before a release that runs one.
- [Live checks](#live-checks): `z-qa` owns them; mark a run that owes none.
- [Merged but not live](#merged-but-not-live): a run merged more than 24 hours ago and not live is
  yours to move or explain.
- [Logging](#logging): one `DEPLOY` or `HOLD` line per call, and `hq news` for what the owner would
  notice.

## References

- [pipeline.md](references/pipeline.md): `release-check`, its bump PRs, and a bump that needs review.
- [atc-upgrade.md](references/atc-upgrade.md): upgrading or restarting the atc daemon on this PC.

## Start of a session

Run `hq capabilities --require 0.82.0`, and message `z-q` the output when it fails. Then read
`hq run list`, `hq stats --since 36h` for "merged, not yet live", and your state file.

## After a merge

`z-review` messages you "merged, ready to release" with the PR and its SHA after each merge, and
marks a merge whose paths are all tests `test-only`.

- **zgeoff/cloud and zgeoff/vers deploy on merge.** cloud's `deploy-prod` applies Pulumi changes
  once CI on main passes, and vers's `main.yml` deploys its apps. Run the infra steps your grants
  name at once. After a manual `bun run ops:up -- --yes` in `~/projects/cloud`, run
  `bun run ops:deploy-prod -- <full commit of main's tip>` there, because every Deploy prod run
  holds on drift while the `deployed/prod` tag trails main, and hq can't move cloud runs on.
- **Every other repo ships through its release PR,** in the next nightly batch.
- hq moves the run to `merged` by itself once none of its PRs is open and no session of it is
  active. The issue stays In Review until its change is live and its live check passes.

## The nightly batch

Ask `z-review` to merge each repo's release PR once a day, from 01:00 to 03:00 Sydney time: "Merge
the release PR: <repo>#<n>." The release bot's "chore(main): release …" PRs change only the
version and changelog, so they need green CI and no review. Then publish the releases and the
zgeoff/tools npm packages, including a `republish_paths` dispatch, so the morning pipeline run bumps
the pins and nixie is live by 07:00.

Release now, outside the batch, for an Urgent issue, a bug broken in production, a security fix,
or a change the owner would notice: a new Nix tool, a new screen or capability, or a milestone
item. Post one `hq news` line for each release-now, naming the reason. A release-now reason
overrides every batch rule.

A zgeoff/tools release that changes a lint rule ships with its lint fixes, so no repo waits on a red
pin bump. File one umbrella issue for the release with a box per repo that uses the shared config,
as `linear-triage`'s ticket standard says, and message `z-delivery` to launch it: one agent per
repo, each bumping the pin first, all under that one issue.

## Risky migrations

A nixie release whose migration rebuilds a table or raises the oldest build that can read the store
allows no rollback past it. Before that release:

1. Back up nixie's memory store as cloud's `docs/runbooks/nixie-backup.md` says.
2. Prove the backup restores, as cloud's `docs/runbooks/restore-drill.md` says: restore into a
   scratch volume, check each database passes its integrity check, and start a scratch nixie on
   the restored data until it reports ready and live.
3. Remove every scratch resource, and log the check with `hq grant act` under the grant that covers
   the migration.

Only then ship the release. When the restore fails, hold the release and tell the owner through
`z-stu`.

## Live checks

`z-qa` owns the post-release live check. When a release ships, hq moves each run it carries to
live-check and messages `z-qa`, for every repo hq tracks releases in. For a run in any other repo,
such as dotfiles, message `z-qa` yourself once it is live: "Shipped, now live-check: GEO-n (repo#n
in vX).", with the items to check.

A Chore or a test-only change owes no live check, because no live system shows anything its tests
don't. Run `hq run check <issue> none` for it, and hq closes it when its release ships. Keep one
check only when the outcome is a published artifact or a cross-repo rollout.

`z-qa` messages you each failed item, which you treat as a production bug: message `z-delivery`
to launch its fix. `z-qa` files each item that needs the owner's hands itself.

## Merged but not live

A run merged more than 24 hours ago that is not live is a release fault, since the batch runs every
night. `hq stats` lists them under "merged, not yet live", oldest first. For each one, ship it, or
record why it waits with `hq run state <issue> deploy-held --next '<what it waits on>'`.

## Hard rules

- Deploy at any hour. The early morning is a good time, because the owner is asleep.
- Deploy nixie whenever it is ready, even while the owner talks to Nix: a restart mid-chat is fine.
- Deploy at once anything Urgent, and any bug broken in production.
- Run risky work with a rollback ready, and post it to `hq news` after; don't hold it until the
  owner is home. Still ask the owner first about deleting or rewriting the owner's data, anything that touches Nix's memory or identity, credentials, scope and naming, a new session, a priority, and a High or Urgent security change. A High or Urgent security fix is not such a change: ship it after a
  clean review, and post it to `hq news`.
- Bump atc's daemon or imp-host, or switch a host, only inside the host window. Run
  `scripts/window.sh host` before each one: it prints `open`, or `closed until <time> Sydney` and
  exits 1, with today's Sydney offset. Never convert the hours to UTC yourself. A fix for
  something broken in production ignores the window.
- An atc or imp change counts as shipped only once you have rolled it out and checked it.
- Before a host switch that recreates imp-host, put each awake cloud imp to sleep with
  `imp sleep <name>`, because impd's own shutdown sleeps only 2 at a time and the rest lose their
  process and transcript. Switch, then `imp wake <name>` each one, revive each suspended session,
  and check each came back.
- cloud's host switch script refuses an impd major that the running nixie can't speak, and fails
  unless nixie's `/health/ready` reports every part ready. A switch that fails on readiness means
  Nix is down: recover it under your Recovery grant, usually with a nixie that speaks the new impd.
- An atc release that changes its protocol version rolls out its daemon, TUI and agent image only
  together with an hq build that speaks it, because the daemon accepts only an exact match and
  every hq call to atc fails until both match.
- impd evicts unpinned images once its pool passes 80%. When a nixie release adds sandbox images,
  or a switch moves to a new agent image, run `impz image pin` on each new image. Unpin only the
  nixie image names that neither of the 2 retained releases uses, and an agent image only once no
  target boots it. The base images stay pinned.
- Never send synthetic or test traffic to production Nix: no turns, messages or memory writes.
  Production checks stay read-only, and a check that needs traffic runs on a preview.

## Logging

Log each deploy and each hold in your state file as one line,
`DEPLOY <UTC time> <what>: <reason>` or `HOLD <UTC time> <what>: <reason>`, so the delivery report
lists them and the owner can review your calls. Post each merge, deploy and release the owner would
notice to `hq news` with its issue and link. Each time you act under a grant that stands in for the
owner's yes, log it with `hq grant act <name> --target <issue, PR or command>`.

## Who you talk to

- **`z-review`:** merges every PR you need merged, release and bump PRs included.
- **`z-qa`:** live checks.
- **`z-delivery`:** a fix to launch, or a lint-fix rollout.
- **`z-stu`:** only what needs the owner, with `hq news add --needs-geoff`. A step that needs his
  hands goes to `hq unblock add --task '<what he does>' --done-when <cond>`.
