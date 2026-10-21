# releases

When merged work reaches production. Shipping code comes first, and a release goes out when it makes sense: overnight, and during the day once a meaningful set of changes has landed, or something critical. Done means live, in the owner's hands (decision D-release-meaningful).

## Merging and done

`z-review` merges code any time, day or night. In zgeoff/cloud and zgeoff/vers a merge deploys: cloud's `deploy-prod` applies Pulumi changes once CI on main passes, and vers's `main.yml` deploys its apps. `z-review` tells you at once after such a merge, so you run the infra steps. After a manual `bun run up` in ~/projects/cloud, run `gh workflow run deploy-prod.yml -R zgeoff/cloud --ref main -f revision=<main sha>`, so the `deployed/prod` tag catches up: while it trails main, every Deploy prod run holds on drift, and `hq` can't move cloud runs on. Its "merged, ready to release" message frees the delivery slot: forget the agent's session and destroy its imp as usual. `hq` then moves the run to `merged` by itself, once none of its PRs is open and no session of it is active. The issue stays In Review until its change is live and its live check passes. That deploy is yours, not the scheduled pipeline's, and a deploy takes your time, about 10 minutes, so batch where the rules below allow it.

The post-release live check is `z-qa`'s. When a release ships, `hq` moves each run it carries to live-check and messages `z-qa`, for nixie, impz, auto-mode, atc and cloud. For a run in any other repo, such as tools or vers, message `z-qa` yourself once it is live: "Shipped, now live-check: GEO-n (repo#n in vX).", with the items to check. `z-qa` runs the acceptance items only a live system shows, records the evidence, and closes the issue. Mark a run that owes no live check with `hq run check <issue> none`, and `hq` closes it when its release ships. `z-qa` messages you each failed item, which you treat as a production bug, and each needs-Geoff item, which goes under "Waiting on Geoff".

The stack merge, pinned to the reviewed head, is in the `pr-review` skill.

## The nightly batch

Merge each repo's release PR once a day, from 01:00 to 03:00 Sydney time, so the 05:41 pipeline run bumps the pins and nixie is live by 07:00. An atc daemon or imp-host bump rolls out from 08:00, as the hard rules say. zgeoff/cloud and zgeoff/vers deploy on merge, not through a release PR, so they stay outside the batch and follow Merging and done.

Release now, outside the batch, for an Urgent issue, a bug broken in production, a security fix, or a change the owner would notice: a new Nix tool, a new screen or capability, or a milestone item. Post one `hq news` line for each release-now, naming the reason. A release-now reason overrides every nightly-batch rule below.

A zgeoff/tools release that changes a lint rule ships with its lint fixes: when you merge its release PR, launch an agent in every repo that uses the shared config, one on an older pin included, which bumps the pin first, to open that repo's lint-fix PR, so no repo waits on a red pin bump. All of them work one umbrella issue for the release, with a box per repo, as the ticket standard in `linear-triage` says, never an issue each. `hq` holds one run per issue, with one lane: add the first agent with `hq run add`, and each other one with `hq run session <issue> <id> --add`, since a second `hq run add` on an open run changes nothing. `hq` attaches each repo's PR whose body says `Fixes` or `Contributes to` the issue, in a repo on the scope list in `docs/skill-development/repo-facts.md`. Attach any other PR with `hq run pr <issue> <repo>#<n>` as it opens: the run moves to merged only once no attached PR is open and no session is active, so a PR left unattached can let it close early.

## The pipeline

zgeoff/cloud's `release-check` runs on the cron `41 */6 * * *` in UTC: at 05:41, 11:41, 17:41 and 23:41 Sydney time during daylight saving, and an hour earlier otherwise. It opens a bump PR for each of atc, imp, nixie and auto-mode whose pin trails its newest release, and `release-bump-merge` merges them once their checks pass. A merged nixie bump deploys on its own through `deploy-prod`. An atc, imp or auto-mode bump still needs your host switch or image build. tools has no bump job.

## Hard rules

- Deploy at any hour: there are no quiet hours for deploys, and the early morning is a good time (decision D-release-meaningful).
- Don't hold risky work until the owner is home. Run it with a rollback ready, and post it to `hq news` after. Still ask the owner first about deleting or rewriting the owner's data, anything that touches Nix's memory or identity, credentials, scope and naming, a new session, a priority, and a High or Urgent security change. A High or Urgent security fix is not such a change: ship it after a clean review, without asking, and post it to `hq news`.
- Deploy nixie whenever it's ready, even while the owner talks to Nix: a restart mid-chat is always fine.
- Deploy at once anything Urgent, and any Bug broken in production.
- By 07:00 Sydney time, the nightly batch is live and checked, except an atc daemon or imp-host bump, which rolls out from 08:00. Work merged after a repo's release PR waits for the next night's batch. From 06:00, check what the morning pipeline run landed. When it failed or missed something, fix it, and deploy by hand from 07:00, live and checked by 08:00.
- Merged work in a repo with a release PR ships in the next nightly batch. An atc or imp change counts as shipped only once you have rolled it out and checked it.
- Bump atc's daemon or imp-host, or switch a host, only from 08:00 to 23:00 Sydney time, at any time in that window.
- Before a host switch that recreates imp-host, put each awake cloud imp to sleep yourself with `imp sleep <name>`. impd's own shutdown pass sleeps only 2 at a time within 100 seconds, so the rest lose their process and transcript. Then switch, wake each imp you put to sleep with `imp wake <name>`, revive each suspended session, and check each one came back.
- The cloud host's switch script in zgeoff/cloud runs 2 checks of its own. It refuses an impd major that the running nixie's imp client can't speak: deploy a nixie that speaks it first, then switch. It fails the switch unless nixie's `/health/ready` reports every part ready: a switch that fails there means Nix is down, so Recovery in your start prompt applies, and the usual fix is a nixie that speaks the new impd.

Never convert these hours to UTC yourself. Before each atc daemon or imp-host bump or host switch, run `scripts/window.sh host` from the `delivery-lead` skill folder. It prints `open`, or `closed until <time> Sydney` and exits 1, with the Sydney offset in force today. A fix for something broken in production ignores the window.

## Bumps that need review

`release-check` labels a bump `needs-review` when it is a major update, a minor update to a 0.x release, or carries a flag such as `migrations` or `sandbox-images-changed`, and `release-bump-merge` leaves it open. Send each to `z-review` as you find it: "Review the bump: cloud#<n>." It reviews it, and messages you "reviewed, gate passes: cloud#<n>" once `hq review gate` exits 0. Then merge it. Merging a nixie bump starts `deploy-prod`, which may run at any hour. Back up any state a step migrates before that step, such as impd's database. Roll it out by the rules above, and record the PR and run links on the release's issue. Put it to the owner as a decision instead only when a finding needs his choice, or a migration deletes or rewrites existing data. A migration that only adds or fills in data is no reason to ask: back up first, and ship it.

## What deploys next

Log each deploy and each hold in your state file's Log as one line, `DEPLOY <UTC time> <what>: <reason>` or `HOLD <UTC time> <what>: <reason>`, so the delivery report can list them and the owner can review your calls. Post each merge, deploy and release the owner would notice to `hq news` as one line, with its issue and link.

Never send synthetic or test traffic to production Nix: no turns, messages or memory writes. A check of production stays read-only, such as its health or its records (decision D-no-test-traffic). A check that needs traffic runs on a preview.

## Live checks on a preview

A PR with a preview comment gets its live acceptance items checked there, before the merge, since the preview ends when the PR closes. Once the PR is final and its preview comment names its head commit, message `z-qa` the issue, the PR, the head commit and those items. `z-review` merges after `z-qa`'s evidence comment for that head is on the issue. A failed item goes back to the PR's agent as a finding. A needs-Geoff item goes under "Waiting on Geoff" and doesn't hold the merge. An item that passed needs no check after the deploy, unless only production can show it. When no `z-qa` session runs, or the PR has no preview comment, the live check stays after the release, with `z-qa`.
