# Changelog

## 0.96.0 — 2026-10-24

The merge gate holds repo instruction files, and runs, the sweep and the ship pass leave working sessions alone.

### The merge gate holds a change to a repo's instruction files until the owner or a proven record clears it.

- AGENTS.md, `skills/` and `.claude/skills/` in zgeoff repos other than hq, hq-private and nixie-definitions are held. The owner's lgtm, a bot author, a z-review exemption, or a z-review mechanical record clears the hold.
- hq proves a mechanical record again from the diff at the head. It passes only a version token, table padding, or a link or code path to the same file.
- `hq pr mechanical` and `hq pr exempt` accept only z-review's atc session, and each adds an `hq news` line.

### Fixes

- `hq review gate` passes a PR in a repo that runs no CI, when the head and the base hold no `.github/workflows`.
- `hq run state` refuses to move a working or blocked run past merged while it has an open PR or an active main session. `--force` overrides it.
- The ship pass leaves a run alone while any session on it, a helper's included, is active.
- `hq run done` destroys a cloud imp with one forget that stops its session, so a slow imp sleep no longer fails the call.
- The sweep stays quiet on a run that waits on an open unblock item, on an asleep session, on a live-check run whose issue is Done, and on a FINAL with the owner's override at its head.
- A moved-head alert says how to record the new head.
- The restart wake tells z-delivery to re-arm its event watch.
- The `hq pr` help line names `mechanical` and `exempt`.

## 0.95.0 — 2026-10-23

Shipping tracks the host build for cloud, a manual hold sticks, and fixes to the sweep, health and wrap-up.

### A cloud PR on a host-build path ships only once `deployed/host` holds its merge.

- The paths come from cloud's `.github/gates.yml` (`gates.nixos.paths` minus `ignore`), read once per pass at main; hq copies none.
- Such a PR needs both `deployed/prod` and `deployed/host`, and is told as "Shipped in deployed/host". A missing tag or an unreadable gates file keeps it unshipped.

### Fixes

- The ship pass leaves alone a run put in `deploy-held` at or after the release that holds its PRs, and `hq run ship` lists it as left held. A hold from before the release still ships.
- The sweep clears a FINAL alert once a review round that started after the FINAL has passed, so a PR reviewed at a newer head stops re-alerting. The exited-session alert and the `hq run` line use the same rule.
- `hq health` shows a ✗ when a stale-restart save request has been asked for over an hour and no read of its answer has worked for over an hour.
- `hq run done` leaves a session unpinned when it cannot stop or forget it, since a pin means the session needs the owner.
- Opening the database retries the switch into WAL while another process holds the write lock, which SQLite does not wait for.

## 0.94.0 — 2026-10-23

Lanes match the slots that sessions really fill, and `hq unblock` gets watch items. Schema v40.

### `hq lanes skip` leaves a Ready issue out of the plan until a time passes or an issue closes.

- `hq lanes skip <issue> --until <ISO|GEO-n> --reason T`, with `list` and `drop`. An until issue hq cannot read shows its error in `list`.

### The local slot count follows what runs on this host.

- Free local slots are capped by the room an unattended provider has here: `localFallback` minus the local runs. `localFallback` is now 6.
- When the awake sessions on this host that belong to runs outnumber the runs filed local, they set the count, whatever their run's state, place or lane. The fleet's own sessions are left out. `hq lanes` shows the source, for example `local 7/6, 0 free (7 live sessions here)`.
- A run filed imp whose awake sessions all run here counts as local only.

### `hq run place <issue> imp|local|none [--note T]` moves an open run to another place.

- The move and its note are logged, and `hq lanes` counts the run at its new place at once.

### `hq unblock` watch items wait on an event, not on the owner.

- `--done-when` also takes `release:<repo>` (the first GitHub release after the add, drafts and prereleases skipped) and `date:<ISO>`.
- `--notify <session>` messages that session once when the item settles. `--deadline <ISO>` marks it overdue and tells the adder, the notify sessions and the owner's session once.
- `--kind watch` items stay out of the console's needs-owner list, the band's count and `hq unblock new`. `hq status` counts them as watching.
- Migration v40 adds `kind`, `deadline` and `overdue_told_at` to `unblocks`.

### Skills

- linear-triage promotes on every pass, and records a park the owner gives in words with the `parked` label.

## 0.93.0 — 2026-10-23

Two features land together: scheduled restarts for the orchestrator and release sessions, and the owner-held path gate.

### hq restarts orchestrator and release sessions on a schedule.

- A session of either role is due 6 hours after its start, or after 3 compactions since it, whichever comes first. hq reads the transcript only when the age alone does not decide.
- hq keeps each session's start by its current id, so a restored session keeps its first start. A busy session is never asked, and the save request says why the restart is due.

### The merge gate holds a PR that changes owner-held paths until the owner's lgtm is on record at its head.

- Owner-held paths: hq's `skills/` and `fleet.json`; hq-private's `skills/`, `grants/`, `docs/sessions*` and every `session-prompt.md`.
- The lgtm counts from the answer sources hq already takes: `console:`, or a `chat:` or `call:` answer recorded with the owner's words.
- The gate reads the PR's files from GitHub, renamed files' old paths included, and fails closed on a read error or past 3000 files. It re-reads the head after every check.

## 0.92.0 — 2026-10-23

Four features land together: `hq refs`, three throughput lines in `hq goals daily`, agent notes with `hq lanes promotable`, and `hq focus` with slot caps.

### `hq refs [--days N]` shows which skill references each role's sessions open, from the Claude Code transcripts.

- For each role, each reference under its skills' `references/` folders, with how many of that role's sessions opened it in the last N days (7 by default), zeros first. A Read of the file or a shell command that names its path counts; one session counts once.
- The transcript scan that `hq refusals` used moves into shared helpers, so both commands find sessions the same way.

### `hq goals daily` gains three throughput lines, and z-review records each follow-up it files.

- Issues: issues filed against closed in the Sydney day, with filed split by source: owner, design, agent, review, live check, bot. No target.
- Bad filings: issues created that point at a PR with no follow-up record from z-review. Target 0; z-triage gets one message per issue.
- Stale: In Progress issues with no run and no session, and open runs whose issue is closed. Target 0 older than 24 hours; z-triage gets each one once.
- `hq followup add GEO-n --from repo#n` records a review follow-up without `--backfill`.

### Agent notes reach z-delivery, and `hq lanes promotable` lists the Backlog issues ready to move to Ready.

- A `decision` or `blocked` note from a delivery agent goes to the orchestrator as `<label> from GEO-n (<session>): <text>`, once. `progress` notes stay in the feed.
- `hq lanes promotable` lists Backlog issues whose blockers are all Done and whose sections are filled, leaving out `parked` ones. It reads Linear and changes nothing.

### `hq focus` steers what free lane slots take, and the lane plan fills one slot pool under caps from pacing.json.

- `hq focus show|set|clear`: terms split by `,`, filters inside a term by `:`. A stored area stays readable when the area list changes.
- Ready issues carry their type, priority, age and project labels. A project with no class label counts as roadmap.
- The caps come from pacing.json `slots` (imp plus local), read at each tick. The band and the impd plan count against them, and the band turns amber when any cap is over. Lends leave the help.
- The Design slot is one reserved slot outside the caps; its issue starts no nudge. Closed runs stay off the Ready picks.
- `hq lanes` prints the local sessions against their cap.

## 0.91.0 — 2026-10-23

`hq run done` wraps up the run's sessions, so z-delivery no longer does it by hand (GEO-1688).

- It unpins and forgets each of the run's sessions and their sub-sessions, unless the owner chats on the run.
- On an imp, it first checks every worktree for uncommitted changes and commits no remote holds. Unpushed work, or a check that cannot run, keeps the imp and its session; the run still closes.
- It notes on the run which sessions it forgot, destroyed or kept, and why.

## 0.90.0 — 2026-10-23

The hq-defs dependency install runs no lifecycle script (z-review's suggestion on 0.85.0).

- hq runs `bun install --frozen-lockfile --ignore-scripts` in hq-defs, so neither a dependency's script nor the repo's own runs in the shared checkout. hq's package.json has none today.

## 0.89.0 — 2026-10-23

A review round that noslop stored counts as a round, even when noslop's post of it to GitHub failed (GEO-1673).

- When noslop exits non-zero and its store holds the review it printed at that head, hq records the round as ok, with its findings, and notes that the post failed. `--fixes-only` and the gate then read it as the last review.
- `hq review` prints a `not posted` line that tells the caller to run `noslop post <file>` to finish the post.
- A run that failed before noslop stored its review still records the round as failed.

## 0.88.0 — 2026-10-23

fleet.json may give a session the `release` role, for the z-release session the fleet throughput design adds.

- `release` joins the role names. A role with several holders, it needs no holder, so today's fleet.json stays valid.
- `steward` stays until the fleet.json that drops z-steward merges.

## 0.87.0 — 2026-10-23

The sweep now sees an open run whose Linear issue is closed (z-delivery: an audit found 41).

- Every 10 minutes the watcher reads the Linear state of each open run's issue.
- The run sweep alerts on each open run whose issue is Done or Canceled in Linear, with what to do: `hq run done`, `hq run drop`, or a look first when a PR is still open. A merged run on its way to live raises nothing, since a "Fixes" merge closes the issue before the release.
- hq drops a run by itself only when Linear canceled its issue, the run has no open or merged PR, and a clean GitHub pass in the same tick saw that. It notes why on the run and tells z-delivery in one message.

## 0.86.0 — 2026-10-23

`/hq close` closes the hq pane in z-stu's session. Before, it opened the pane again, so the pane could not be closed.

- `/hq` still opens the pane, and its argument hint now shows `[close]`.

## 0.85.0 — 2026-10-23

hq-defs gets its dependencies, so the repo's scripts run there (z-steward: `check:skills` failed in hq-defs with "Cannot find package 'ts-pattern'").

- After each sync of hq-defs, hq runs `bun install --frozen-lockfile` there when `node_modules` is missing or `bun.lock` differs from the last good install.
- A failed install turns the hq-defs line red for `hq health`, keeps the sync, and runs again on the next tick. hq-private never installs.

## 0.83.0 — 2026-10-22

hq speaks atc's protocol 11, the version on atc main after its restart events and the kernel's peer session.

- hq sends protocol 11 in its hello. atc refuses any other version, so this hq cannot reach an atc 7.0.0 daemon, which speaks 8: install this hq in the same window as the atc release that speaks 11.
- Nothing else hq sends or reads changed: the new restart events and the hello's `peerSession` are not used, and the events cursor keeps its form.

## 0.82.0 — 2026-10-22

`hq linear issues` writes a team's Linear issues to page files that the triage scripts read.

- New: `hq linear issues --team <key> --state <name>[,<name>...] [--updated-since <time>] [--fields <list>] --out <dir>`. State names are matched without regard to case; a name the team lacks is refused as `bad_args`, listing the team's states. `--updated-since` takes an ISO date-time with an offset or `Z`, or a date `YYYY-MM-DD`; anything else is `bad_args`. `--out` must be an existing directory that holds no `issues-<n>.json`; hq refuses one that does as `bad_args` and deletes nothing.
- It reads 100 issues a request and writes each page as `<dir>/issues-<n>.json` holding `{"issues":[...]}`, then prints the paths one per line. With `--json` it prints `{ files, issues }`. A failed Linear call, or an answer that does not parse, exits non-zero and writes no file. A page write that fails, such as on a full disk, removes every page this run wrote, keeps the directory's other files, and exits non-zero.
- Each issue carries `id`, `title`, `url`, `status`, `statusType`, `project` (`{"name"}` or null), `priority` (`{"value","name"}`), `labels` (`[{"name"}]`), `parentId`, `createdAt`, `updatedAt`, `completedAt`, `canceledAt` and `description`. `--fields` picks a subset; an unknown field is `bad_args`.
- `audit-issues.sh`, `inflow.sh` and `overlap-candidates.sh` read the files as they are.

## 0.81.1 — 2026-10-22

3 fixes found while fixing the first review, and 4 skill changes that merged in the old repo after this tree began.

- The sync gate in the pr-review skill escapes each path in its GitHub contents reads, as the rename check does.
- A noslop round's worktree and files are named `<repo>+<pr>`, so `kettle1` PR 2 and `kettle` PR 12 no longer share a name. A worktree under the old name still holds a pin, and is shown by its old name.
- The skill check reads a bracketed word as a verb only when hq lists it as one, so `hq open [id]` takes an id.
- Skills: each unblock item gets the condition that ends it; z-delivery files owner steps with `hq unblock add` and sends decisions to z-triage; z-stu records overrides and accepted risks; which credentials are z-delivery's is in the private halves.

## 0.81.0 — 2026-10-22

hq starts from a clean tree in a new repo, and the first full review's fixes land with it.

The cloud metrics URL comes from the local settings file as `HQ_CLOUD_METRICS_URL`; the capacity line calls the host `cloud`. `HQ_CLOUD_HOST` holds the cloud host's ssh name, which the preview-qa skill reads, and `hq health` lists it when it is missing.

- An owner source for `hq pr override` and `hq pr accept-risk` now has to name the PR and the action it approves. What it must hold is in this file's private half: read `CHANGELOG.private.md` in the local hq-private clone (`hq defs` shows where it is).
- An override source must be a call option whose `grants` names the PR and the `head` the owner approved. A grant with no head is refused, and a plain Yes to a `call:` now counts for `hq pr accept-risk` only, since it names no head.
- The watcher skips a step that an earlier pass gave up on until that step stops, so a slow goals sync never runs twice at once.
- `hq answers` shows an old answer's title, issues, session and PR as unknown when its item changed after it, instead of the item's current ones.
- `hq review` checks out the PR's own head commit, not a branch of the same name, so a fork PR is reviewed as itself. The rename check in the pr-review skill escapes each path in the GitHub contents URL.
- `hq repo archive-history` also moves the cached PR facts of the stats, in the same transaction, and counts them on `--dry-run`.
- The fleet and probe timers carry the installing shell's `HQ_*` settings and `XDG_CONFIG_HOME` into their units, with `HQ_DB` made absolute. A timer removal checks each systemctl step before it deletes the unit files.
- Fixes to the backup password and lock, the outbox flush, ask changes, unblock closures, the merged-PR search position, stats merge times, the morning and daily checks, and more: each is named in its own commit.
- `lint:changed` lints nothing on a branch whose base holds no `package.json`, which is only the import of the tree into an empty repo.

## 0.80.0 — 2026-10-22

`hq review gate` passes a PR on its open findings and its CI, not on `noslop check`. A late one-line commit no longer needs a new review.

- The gate reads `noslop findings` and one `gh pr view` read (head, author, checks). It blocks on a finding in state `open` or `deferred`, and on `accepted-risk` unless hq holds an owner record for that finding. It runs no `noslop check` and keeps no state-key cache, so a gate reads 1Password once each time. It needs noslop 0.4.15 or later.
- Every PR needs green CI on its head: each check, required or not, must be SUCCESS, SKIPPED or NEUTRAL. Pending, failing or cancelled blocks, an empty rollup blocks, and noslop's own check is ignored. This now covers repos off the noslop list, bot PRs and PRs on Codex.
- A PR on the noslop list also needs one completed noslop review on record, and the gate blocks if the head moved while it ran.
- `hq pr override` passes every open finding at the head it was recorded for, never over red CI, and a new head voids it. An override logged before 0.80.0 expires at install: it meant only "pass a head no review read", so the gate and `hq pr status` no longer count it. Record a new one if the owner still wants it. The changes-then-lgtm pair no longer stands for an unreviewed head.
- New: `hq pr accept-risk <repo> <pr> <finding-id> --source S --note T` records the owner's acceptance of one finding's risk. A reply by `zgeoff` in the thread proves nothing, because every session posts as that login.
- `--source` is now checked for `hq pr override` and `hq pr accept-risk`. What each source must hold, and the limits of the checks, are in this file's private half: read `CHANGELOG.private.md` in the local hq-private clone (`hq defs` shows where it is).
- The round cap, `--redesign`, `--fixes-only` and the basis checks stay as they were.

## 0.79.0 — 2026-10-22

`hq unblock` is the one list of what waits on the owner, and an item closes itself when the issue, PR or decision it waits on settles.

- New: `hq unblock add --done-when <cond>` (repeatable, with `--task` or `--item`) and `hq unblock done-when <id> <cond>...` set the conditions that close an open item. A condition is `issue:GEO-n`, `pr:repo#n` (owner `zgeoff`) or `pr:owner/repo#n`, or `doc:<Linear document id, slug or URL>`. A bad value is refused as `bad_args`. Migration v37 adds the nullable `done_when` column.
- An item closes as `done`, with the note `settled: <cond> <what happened>`, when any one condition holds: the issue is Done or Canceled, the PR is merged or closed, or the document's first non-empty line starts `Status: decided` (any case). The document is judged by its first line, not by its issue, which can stay open after the decision.
- hq queues one message to the session that added the item and to each session in `notify`, naming what settled it. Nothing goes to the owner.
- The watcher's subject-PR pass is now the conditions pass, with the same 10 min throttle. It reads the `issue:` conditions in one Linear query for each 100, and an issue moved to another team still matches its old identifier. It reads each `doc:` condition in one query and each PR once. A failed read leaves the item open and logs `unblock conditions: <id>: <error>`; one bad condition never blocks the others. An item whose subject PR merged or closed is still dropped, not done.
- `hq unblock list` shows `· recheck` and `--json` carries `"recheck": true` on an open item more than 3 days old with no condition and no subject PR. It is worked out at read time.
- `hq unblock show`, `hq unblock list` and the console list the conditions.

## 0.78.2 — 2026-10-22

`hq review --fixes-only` follows a review base that is a `--fixes-only` run's head back to that run's base. Before, 0.78.1 stopped there and counted the commits the earlier reviews read as below the review base.

## 0.78.1 — 2026-10-22

`hq review --fixes-only` maps a rebased PR whose last review read only the commits since an earlier review, when the rebase kept every patch.

- A review base that is the head of an earlier review of the same PR now leads back to that review's base, so every reviewed commit pairs with the rebased branch. Before, hq paired the later review's commits with the branch's first commits and reported a changed patch.
- An empty reviewed commit, such as one that starts a new check run, pairs with an empty branch commit in the same place. Before, any empty reviewed commit refused the mapping.

## 0.78.0 — 2026-10-22

hq reads Ready per lane from Linear every 10 min, by the rules in the new `lanes.json`, so z-delivery no longer reports it by hand.

- New: `lanes.json` maps Ready issues to pacing.json's lanes: the cleanup set and noslop projects, the `process` label, the memory issue and its sub-issues, the atc, imp and cloud projects, and every other issue to flexible. Issues in `hq maintenance`, `hq roadmap`, `nixie-definitions maintenance` and the `Design` label are skipped, each with its reason.
- The watcher reads the pages first, then writes the counts, the total and the skipped issues in one report. A failed read writes nothing, keeps the error in meta `lanes_ready_linear_error`, and logs it; the old counts age out as before.
- The slot nudge says hq reads Ready from Linear. The stale alert names the last read's error and gives `hq lanes ready` as the fallback. `hq lanes ready` itself is unchanged, and the next read overwrites a hand report.
- A read that changes no count and no skipped issue writes no `ready-by-lane` event.
- `hq lanes` warns when the checkout's `lanes.json` differs from the installed build's.

## 0.77.1 — 2026-10-21

When the merge gate refuses because noslop has no review of the head, it names a new `hq review` or, past the round cap, the owner's `hq pr override`. It no longer points to `hq review --fixes-only`, which noslop's net-change key does not count as a review.

- `hq review check` and `hq review --fixes-only` keep the fixes-only hint.

## 0.77.0 — 2026-10-21

The merge gate trusts noslop's keyed check, and the owner can override a refusal at one head with `hq pr override`.

- A passing noslop check on a rebased, retargeted or merged head now passes the gate. hq's own commit mapping no longer refuses it as unmapped, shut or unknown, and the pass path fetches and lists no commits.
- hq no longer judges merge resolutions from the summary marker; noslop's check decides them.
- The owner's `changes` at the last lens review head and `lgtm` at the head now no longer need hq to account for each commit between. noslop's check must still be refused only for want of a review, with no open finding, failed call or rejected merge. Both of noslop's refusal wordings count: "No noslop review for this commit" and "No noslop review of this change ... the patch changed since the review".
- New: `hq pr override <repo> <pr> --source chat:ID|console:ID|call:ID --note T` records the owner's override at the PR's head now. The gate honours it only at that head, only from an owner source (the checks `hq pr answer --source` makes), and only when noslop's one complaint is that no review covers the change. It is checked before the `changes` and `lgtm` pair.
- `hq pr status` (text and `--json`) shows the override that stands at the head now, with its source, head and note.
- A PR whose summary marker has no key passes only at its exact head until its next review; an override covers it meanwhile.

## 0.76.1 — 2026-10-21

hq's messages, help, errors and comments say "the owner" where they named the owner, and use they/them. Labels and identifiers other tools match on keep their text: the `Needs Geoff` label, `--waits-on-geoff`, `--needs-geoff`, `geoff-chat` and the JSON keys.

- `hq stats` names its section "Wait on the owner". It still counts a run blocked on "Geoff" or "the owner".
- CHANGELOG.md and REQUESTS.md cite decision IDs where they quoted the owner.

## 0.76.0 — 2026-10-21

Runs in tools, noslop, hq and vers move to live-check (or done) from their own release facts, and `hq defs sync` puts a clean detached tree back on main. Process alignment Q3.

- tools and noslop: a merged PR ships once each release-please package it changes has a published release holding the merge. A PR that changes no package ships at its merge, with no tag.
- hq: a merged PR ships once the installed hq is a clean build whose commit holds the merge, as `build:<short commit>`. A source run or a dirty build ships nothing.
- vers: a merged PR ships at its merge time, since a vers merge deploys.
- `hq defs sync` runs `git switch main` on a tree with a detached HEAD when its working tree is clean, HEAD is on origin/main's history and local main has no commits origin/main lacks, then fast-forwards as before. Every other detached tree is reported and left alone. The re-attach is logged as its own `tree-reattached` event; `tree-forwarded` still means a fast-forward happened.
- tools and noslop read a PR's changed files from the paged API, so a PR with more than 100 files is read in full. An hq PR waits with no error while GitHub does not know the installed build's commit.
- The release scan finds the oldest containing release by halving the list, and keeps each compare answer for a fixed tag or commit between passes (meta `releases_compared`, pruned to merges still waiting), so a scan the compare cap cuts off resumes. A moving ref, such as cloud's `deployed/prod`, is asked again each pass.
- A run PR that shipped at its merge has no `shipped_tag`, and its shipped line reads "at merge".

## 0.75.1 — 2026-10-21

A run PR opened and merged between two watcher passes now attaches to its run, and gets its merge in the same pass. Before, the attach pass searched only open PRs, so such a PR never attached.

- Each scope repo gets a second search, for PRs merged since an hour before the last pass (at least a day back; a day on a first pass). A PR both searches find attaches once.
- The pass attaches first, then reads merges and closes.
- A failed or full search names which one it was: `open PR search in <repo> …` or `merged PR search in <repo> …`.

## 0.75.0 — 2026-10-21

hq learns a run PR's open, merge and close from GitHub, so sessions no longer run `hq run pr`, `hq run merged` or `hq run closed` for them. Process alignment Q3.

- Every 10 minutes the watcher reads each open PR of an open run. A merged PR is marked merged with GitHub's merge time and merge commit, and a closed one is marked closed, both by `hq-github`. The run moves to merged by the usual rule: a PR merged, none open, no active session.
- In the same pass, hq attaches an open PR in a scope repo that no run holds to the open run its body names with a line starting `Fixes GEO-n` or `Contributes to GEO-n`. `Related to` never attaches. A body naming two different open runs attaches to neither, and the watcher logs it.
- `hq run merged` still works. On a PR the watcher already marked merged it succeeds and changes nothing. A closed PR is still refused.

## 0.74.2 — 2026-10-21

`hq --help` lists `hq version [--json]`, so a skill can name the command and pass `check:skills`.

## 0.74.1 — 2026-10-21

`hq stats` counts a run whose waits-on text says "the owner" as waiting on the owner, as it already did for the owner's first name, so the waits-on text can switch names without a gap in the stats.

## 0.74.0 — 2026-10-21

`hq version --json` reports the commit the installed binary was built from, so the triage closer can treat an hq merge as deployed once the installed hq holds it. Process alignment Q2.

- `bun run install-bin` builds the commit and a dirty flag into the binary. `hq version` gives `commit` (the full sha) and `dirty` (true when the tree held uncommitted changes), and the text adds "built from <short sha>".
- A run from source, or a build outside git, gives `commit: null` and `dirty: null`.
- `HQ_INSTALL_OUT` builds to another path and leaves the lanes watcher alone. The install test uses it.

## 0.73.2 — 2026-10-21

The grants tests build on an invented fleet in `scripts/fixtures/grants/`, so they pass once hq no longer holds the private grants, start prompts and docs.

## 0.73.1 — 2026-10-21

`bun run check:grants` can pass once hq no longer holds the private grants and start prompts.

- A still-ask site in `grants/still-ask.yaml` can take `tree: private`. Without `--private`, the check skips a private site that hq no longer holds. With `--private <dir>`, the site must be in hq-private.
- An unmarked site that hq no longer holds is still an error, and any other `tree` value is refused.

## 0.73.0 — 2026-10-21

`hq review` writes the review mark on the PR's run itself, so no session has to record its rounds. Process alignment Q1.

- When a noslop round starts on a PR that an open run holds, hq marks the review started, as `hq run reviewing` does.
- When the round ends ok, whether a lens round or `--fixes-only`, hq marks the PR reviewed at the head the round read and counts the round, as `hq run reviewed` does. The run's one-round-plus-re-check limit does not apply, since noslop's round cap ran first. The event's actor is `hq review`.
- A round that gives no review, or a PR on no run, writes no reviewed mark. A Codex review still needs `hq run reviewed`.

## 0.72.1 — 2026-10-21

`hq fleet` and the watcher's stale-prompt restart read every session's prompt again. Related to GEO-1546.

- The prompt check fetched hq-private's main inside its `session.get` calls. That fetch blocks, and at about 3.3 s it ran past the 3 s budget, so every session but the first read `unknown`, and the stale restart could act on none of them. hq now fetches once before the calls, and each prompt read uses that fetch.

## 0.72.0 — 2026-10-21

hq reads the start prompts and the grants from a second checkout, the private repo `zgeoff/hq-private`, and `hq repo archive-history` moves a repo's history to a new name.

- `hq defs setup private` clones `zgeoff/hq-private` to `~/.local/share/atc/workspaces/hq-private` (`HQ_PRIVATE_DIR` overrides it) and refuses another origin. It is not a source for `hq defs use`; `hq defs setup hq` is unchanged. hq never clones it on startup.
- `hq defs sync` and the watcher tick fast-forward it with the rules for hq-defs (refuse a dirty tree, another branch or local commits; flock; retry on contention). Each sync records its own result and logs a `tree-forwarded` event naming the tree.
- `hq health` gains the `private-tree` check, with the 30-minute rule and lines that start `hq-private:`. An absent checkout is red and says to run `hq defs setup private`. The hourly fetch check also fetches hq-private.
- A `main:` start prompt is read from hq-private's `origin/main` after a fetch (cached for a minute per tree), never from a working tree and with no fallback to hq-defs. A missing prompt, an absent clone or a failed fetch refuses with `no_prompt` naming the hq-private path. Drift reads `unknown` then, and nothing restarts.
- `hq defs check` checks both trees: hq-defs for its origin, `capacity.sh` and `pacing.json`; hq-private for its origin and every declared role prompt on `origin/main`. It runs `scripts/grants.ts --check --private <dir>`, and a failure shows as a ✗ line with the script's first output lines.
- `scripts/grants.ts --private <dir>` takes the grants and the six session prompts from that directory and `still-ask.yaml` from hq. Without the flag nothing changes. Errors name the tree.
- `hq repo archive-history <from> <to> [--dry-run]` re-keys a repo's history in hq.db and noslop's store, in either direction. It refuses a running noslop, an empty `<from>` and any repeated key (it names the keys); it backs up both files, runs one transaction per database, prints counts per column and logs an event. `--dry-run` writes nothing.

Contributes to GEO-1546.

## 0.71.4 — 2026-10-21

hq speaks atc protocol 8, for atc 7.0.0. Install it together with atc 7.0.0: atc refuses a hello on another protocol.

- `PROTOCOL_V` is 8. The stub daemon in tests defaults to build 7.0.0, protocol 8.
- atc 7.0.0 changes only `sources.complete`, `sources.interpret` and the picker's use of `agents.list`, none of which hq calls. On an isolated atc 7.0.0 daemon, hq's hello, `session.list` and `events.read` answer, and the events cursor is still the tuple `["events", id]`.

## 0.71.3 — 2026-10-21

The gate and `--fixes-only` read the commits below a review's recorded base that a PR still holds. Related to GEO-361.

- A stack PR reviewed on top of a lower PR, then retargeted to the base with no rebase, still holds the lower PR's commits under its reviewed head. Each one that is neither in the base by patch nor in a PR merged into the base now counts as unreviewed, and the basis shuts with advice to run a full review.
- A lower PR that squash-merged or merged into the base leaves nothing to read, as before.

## 0.71.2 — 2026-10-21

The gate and `--fixes-only` read a rebased stack PR's reviewed commits from the base its review read. Related to GEO-361 and GEO-1544.

- A lower stack layer's commits below that base had their own PR's review. A rebase after the lower layer's squash no longer counts them as reviewed commits the branch dropped, even when the squash changed them.
- A commit below that base which the branch now holds as its own still counts as unreviewed, and the mapping refuses.
- A review that recorded no base keeps the earlier rule, which reads from today's base.
- The 0.71.1 lookup of a dropped commit's merged PR is gone: no case needs it. The merge rule from 0.71.1 stays.

## 0.71.1 — 2026-10-21

The gate and `--fixes-only` now read a stacked PR whose lower PR squash-merged into the base. Related to GEO-361 and GEO-1544.

- A merge whose second parent is a commit of another PR, merged into this PR's base with its merge commit in the base, counts as a merge of the base. A clean one is accounted for; one with a resolution goes to noslop's resolution check in a `--fixes-only` run. A merge of a branch that never merged still refuses.
- When a rebase leaves out reviewed commits, hq first matches as before. If that refuses, it leaves out the reviewed commits GitHub lists under such a merged PR, and matches the rest in order. A reviewed commit dropped with no merged PR still refuses.
- hq asks GitHub (`commits/<sha>/pulls`) only for those commits; a failed answer fails closed.

## 0.71.0 — 2026-10-21

Machine-specific values leave tracked code for an untracked local settings file, and the other private strings the publication scan found go too.

- New file `${XDG_CONFIG_HOME:-$HOME/.config}/hq/local.json` (path set by `HQ_LOCAL_CONFIG`): a flat JSON object of strings. A variable set in the environment wins over the file. A file that is not valid JSON, or not a flat object of strings, refuses with `bad_config` naming it. hq never writes it.
- Five keys come from it: `HQ_NOSLOP_OP_VAULT` and `HQ_NOSLOP_OP_ITEM` (were constants in the noslop secrets loader), `HQ_LINEAR_OP_REF` (was the Linear key ref), and `HQ_PROBE_TARGET` and `HQ_PROBE_READY` (lost their Nix defaults). `HQ_PROBE_CONTROL` keeps its public default. Other keys in the file are ignored.
- A missing key refuses with `bad_config`: `<NAME> is not set: put it in <file path> or the environment`.
- `hq health` gains the `local-config` check: `local settings: all 5 set`, or not ok with the missing keys and the file path, or the bad file named.
- The `hq probe run` help line, two old entries below and the docs no longer name Nix's host or tailnet address.

Contributes to GEO-1546.

## 0.70.1 — 2026-10-21

Related to GEO-1559: an owner pass did not carry forward. After the owner's lgtm passed impz#547 at 8d544da, a merge of the base made be05614, and the gate refused it.

- The owner rule now takes the owner's `changes` at the newest head where the gate passed since the last lens round and where the owner's last answer is `changes`. An owner pass ends with the owner's `lgtm`, so the rule moves on to the `changes` before it. With no pass since the lens round, it uses the lens head, as before.
- Every other guard stands: the owner's newest answer must be `lgtm` at exactly the PR's head; every unread commit must come after the chosen head; and that head must be in the PR's head.
- `changes` at the lens head still refuses once the gate has passed at a later head.

## 0.70.0 — 2026-10-21

hq speaks atc's protocol 7, for atc 6.0.0. Install it in the same step as the atc daemon upgrade: a 6.0.0 daemon refuses hq 0.69 and older, and an atc 5 daemon refuses this release, with atc_protocol_mismatch. Related to GEO-1374.

- The hello sends protocol 7.
- The events cursor is atc 6.0.0's tuple `["events", id]`. The start cursor hq writes after a feed reset uses it, and the reset check reads the event id from it.
- The first read after the upgrade refuses the stored atc 5 cursor, so ingest resets once and rereads the feed from its oldest kept event. The notes that hq already kept are not doubled.

## 0.69.0 — 2026-10-21

Removes code, screenshots and a retired shim that hq no longer needs, and adds a dead-code check. Contributes to GEO-1546.

- `hq noslop backfill` is gone, with its modules, tests, `--store` and `--dry-run` handling on `hq noslop`.
- The retired `nixie-definitions` defs-source shim is gone, and so is the `defs-switch` health check. A defs-source file that names anything but `hq` now fails with `bad_defs_source`, and `hq defs use nixie-definitions` fails like any other unknown source.
- The unused `src/releases/last-errors.ts` and 11 unreferenced screenshots of the band and the console are deleted.
- Types that nothing imported lose their `export`.
- `bun run deadcode` runs knip over the source, scripts, tests and the hq-band mod.
- Code comments no longer quote the owner.

## 0.68.1 — 2026-10-21

Related to GEO-1559: the owner rule in `hq review gate` misses a PR whose gate passed after a `--fixes-only` run (impz#547).

- The owner's `changes` now counts at the newest head where the gate passed since the last review that ran its lenses. With no such pass, it counts at that review's head, as before.
- When the gate passed at a later head, every commit the gate still holds unread must come after that head, and that head must be in the PR's head. A commit up to it that no fixed answer names, or a head that left the branch, still refuses.
- A `changes` at the lens head no longer counts once the gate has passed at a later head.

## 0.68.0 — 2026-10-20

GEO-1453. `hq fleet ensure`, run by the hq-fleet timer every 5 minutes, now restarts a declared session whose start prompt has been stale for over 2 hours, at a quiet moment, after the session says it saved its state.

- A session that reads stale gets a first-stale record in meta `fleet_stale_since` (`{name: {sessionId, at, commit}}`); the record goes when the session reads current or its id changes. An `unknown` reading never counts.
- Once stale for over 2 hours, outside quiet hours (03:00 to 07:00, `HQ_QUIET`), hq asks the session by message to save its state and answer `saved` or `busy`. It asks only when atc says the session is `done` (so never `running` or `needs_you`), none of its own runs is `deploying` or `deploy-held`, no message to it waits in the outbox, and its last activity is over 2 minutes old. It never asks the owner role (`z-stu`) or the session that runs the check, and asks at most one session per tick.
- On `saved`, and still at a quiet point, hq stops the session, unpins it and forgets it, then spawns it from `main` in the same ensure and adds a news item naming the commit. If the forget fails or atc answers with a `confirmToken`, hq pins the session again and spawns nothing; hq never sends the token back. If the spawn fails after the forget, hq tells `z-stu` at once, and a later ensure spawns the session.
- `busy`, `unanswered`, no answer in 10 minutes, or a session that is no longer quiet skips the round: the next ask waits 1 hour, then 2, then 4 hours at most. After 6 skips hq tells `z-stu` once and never restarts the session unasked. The state is in meta `fleet_refresh`.
- Fix: `session.kill`, `session.update` and `session.forget` join the atc writes that a test or a run on a scratch database refuses with `atc_write_refused`, so such a run can no longer stop, unpin or forget a live session.

## 0.67.0 — 2026-10-20

Fixes GEO-1559: `hq review gate` passes a head that the owner answered after asking for changes, with no new noslop round.

- When the owner's last answer at the last reviewed head is `changes`, and the owner's newest answer is `lgtm` at exactly the PR's head, that lgtm stands for the commits after the reviewed head. The gate reads both answers from the `pr-answer` events, so the lgtm does not hide the changes before it. Each answer must name a `chat:`, `console:` or `call:` source, and an event that does not parse refuses.
- noslop's check still judges the last review: it must refuse only because no review covers the head, with every finding holding a valid disposition and no failed call, reporter or merge resolution. hq reads that outcome from the check's output when noslop exits 1.
- The reviewed head must be in the head's history, and the head hq fetches must be the head the owner answered at. A rebase that the mapping cannot follow, a git failure, or a head that moved still refuses.
- Without that pair of answers the gate refuses the commits as before: no `changes`, an `lgtm` at an older head, a later answer after the `lgtm`, or an answer with no source.

## 0.66.1 — 2026-10-20

Related to GEO-1525: the cost goal gets a target, GitHub Actions spend of at most $50 a month.

- The default cost target is `<=50`, shown as "<=$50 a month on Actions". The goals sync, in the watcher every 30 min and in `hq goals sync`, reads the month's spend from `GET /users/zgeoff/settings/billing/usage?year=<y>&month=<m>` (the UTC month GitHub billing uses) and sums `netAmount` of the `actions` product, in any case. It keeps the reading in meta `actions_spend`.
- The daily check-in's Cost line and the weekly review's Cost row show "Actions $<spend> of $<budget> budget to date": the budget is $50 × the UTC day of the month / the days in the month, so the 1st allows $50/31 in October and the last day all $50. The mark is green at or under it and red over it. The Claude 7-day and 5-hour text follows the spend; the line's 159-character cap now cuts the end of that text, so the 7-day peak and CI minutes can be lost from the daily line.
- The spend shows as "Actions spend unknown", with no colour and never $0, when gh fails or lacks the permission, the JSON does not parse or has no `usageItems`, an item has no product or numeric `netAmount`, or the reading is from another UTC month or over 2 hours old. A failed read replaces the last good one, and the watcher logs it as "Actions spend unknown".
- The weekly review's cost colour now judges the Actions spend, not the Claude 7-day peaks. `hq goals target cost <op> <value>` takes US dollars a month, from 0 to 10000, and a stored cost override is read as dollars.

## 0.66.0 — 2026-10-20

GEO-1450. The schema moves to v36: a new `shipped_cache` table (kind, key, body, fetched_at, expires_at). hq backs the database up on the first run after install, as for any migration.

- `hq console`'s Shipped report keeps what it reads in `shipped_cache`, so a restart no longer starts cold. A Sydney day before today is kept for good; today is read again on every load. A Linear issue that is Done or Canceled is kept for good, an open issue and a project's burndown issues for 5 minutes. Only the issues not kept are asked for, still 100 to a query. Each kept entry is checked against its schema when it is read: one that does not fit is treated as not kept, so it is fetched again and replaced. The in-memory 5-minute report cache is gone, since today is now read on every load.
- The report reads merged PRs one Sydney day at a time with `merged-prs.sh daily <date>` and merges the week itself, into the object `merged-prs.sh weekly` prints. `today` and `yesterday` are one day each; `week` is Monday to the day that holds the time, and later days are not read. A week with more than 1,000 merged PRs now lists every one, because no single search spans the week. A single day with more than 1,000 would still hit GitHub's cap and show in the report's fetch-gap line.

## 0.65.1 — 2026-10-20

Related to GEO-1551: a rebased PR with no new commit and no `fixed` answer, where noslop refuses `--fixes-only`, no longer loops between that refusal and a gate hint that points back to it.

- When noslop refuses an `hq review <repo> <pr> --fixes-only` run, for any reason, hq keeps the refusal against the PR head it fetched (`refs/hq/pr/<n>`), with noslop's words, in meta `noslop_fixes_only_refused:<repo>#<pr>`. Any review noslop then gives on the PR clears it.
- When `hq review gate` or `hq review check` finds no noslop review for the head and would point to `--fixes-only`, it now says, on the head noslop refused it, "noslop refused --fixes-only on this head (<its words>). The next step is a new review round: hq review <repo> <pr>." A refusal kept at another head is ignored, so the `--fixes-only` hint stays.

## 0.65.0 — 2026-10-20

GEO-1049, J11, J12 and J13. z-triage's `check.md` and intake's `SKILL.md` change after this release installs, through z-steward: until then z-triage still sends the two messages below itself, so the owner may hear each twice.

- J11: every message the outbox flush sends now carries `notice: false` on atc's `session.message`, so atc queues no answer notice for any session. The send stays detached (`systemd-run`), so intake still sees the local `hq` sender label; atc ignores `from` for a session caller.
- J12: `hq restart` writes its log under hq's own state dir, `${XDG_STATE_HOME or ~/.local/state}/hq/hq-restart-<stamp>.log`, and creates the folder first. Nothing in hq reads these logs back, so restart logs from before 0.65.0 stay where they are, in `~/.local/state/atc/`.
- J13: the watcher now queues the two messages z-triage's check sent. On the first tick at or after 07:00 Sydney time on each Sydney date, when nothing is open and a call waits (as `hq status` shows them), it queues "call ready" to the owner (topic `call-ready-morning`, date in meta `call_ready_morning_date`). Outside 03:00 to 07:00 Sydney time, when `hq unblock new` lists items, it queues "unblock list changed" (topic `unblock-changed`) once for each new highest unpushed item, and again at most every 60 minutes while they stay unpushed, until `hq unblock pushed` moves the cursor past them (meta `unblock_changed_told_seq` and `unblock_changed_told_at`).

## 0.64.7 — 2026-10-20

- `hq noslop pin <sha>` refuses with `noslop_busy` (exit 1) while a noslop CLI runs from hq's clones (`pgrep -af`; exit 1 is none, any other failure refuses) or a review round is open, naming each process (pid and command) and each round (repo#pr and its start time). hq writes a round's row only when it ends, so an open round is read from the review's worktree folder (`<repo><pr>-noslop-<pid>` in the review folder) whose process is alive. `hq noslop pin <sha> --force <reason>` skips only that refusal; the reason must not be empty and is recorded in the pinned event.
- After the checkout and install, the pin compares the migration names in the new clone's `adapters/sqlite/src/load-store.ts` with the store's `kysely_migration` (read-only). When the store has a migration it lacks, hq backs the store up to `<store>.bak-<short sha>-<UTC time>` (SQLite `VACUUM INTO`, then `PRAGMA integrity_check`), counts every table, applies the migration by running a cheap `store query` with the new noslop from an empty folder, then checks that every new name is held and no table lost rows. A lost row or a missing name refuses with `store_migration_failed`, names the backup and how to restore it, and does not write the pin. The pin works on the store noslop itself opens (`XDG_DATA_HOME`, else `~/.local/share`) and refuses with `bad_args` when `HQ_NOSLOP_STORE` names another file, since noslop ignores that setting. It checks that noslop is idle again after the install, right before the store query, because reviews take no clone lock; a review that started meanwhile refuses with `noslop_busy` and the backup is removed. Names hq cannot read, or a store it cannot read, refuse with `store_unreadable`; a missing store file has nothing to migrate. The pinned event records the backup path, the counts and the force reason, and the pin prints a migration block or "no store migration".
- A failed store migration leaves a marker in hq's meta (`noslop_store_migration_failed`: the sha, the failed migration names, the backup and the time). Every later pin, `--force` included, refuses with `store_migration_failed` while the store still holds any of those names, naming the backup and how to restore it; once the store is restored from the backup, the next pin clears the marker and migrates again under the guard.

## 0.64.6 — 2026-10-20

- `hq review --fixes-only` and the gate fetch the PR's head into `refs/hq/pr/<n>` and read that ref, not `FETCH_HEAD`. Another fetch in the same clone, such as a review of another PR, no longer makes hq read another branch's tip as the PR head and refuse with "does not map onto the rebased branch" (GEO-1531).

## 0.64.5 — 2026-10-20

- A hung `git fetch` in the defs sync no longer holds `hq-sync.lock`: the lock is held by `flock -o` alone, git runs under `timeout -k 5` (`HQ_SYNC_GIT_TIMEOUT_MS`, default 40000), and the sync returns a refusal when the fetch times out (GEO-1147).
- `hq fleet ensure` now sends every pending or failed `watcher-stale` alert on each run, so an alert queued while atc was down reaches z-stu once atc is back, even though the stuck watcher cannot retry it (GEO-1147).

## 0.64.4 — 2026-10-20

- `hq review <repo> <pr> --fixes-only` no longer refuses a merge of the base that holds conflict resolutions or hand edits: the run goes on to noslop 0.4.5, which checks the resolution. A merge of a branch other than the base, and an unnamed commit, still refuse (GEO-1501).
- The gate (`hq review gate`) and the hint in `hq review check` count such a merge as accounted for only when noslop's summary marker, on the summary comment the noslop App posted, lists its full sha in `checkedMerges` and not in `rejectedMerges`. A merge it does not list is "not checked yet" and points to `hq review <repo> <pr> --fixes-only`; a rejected one says noslop judged the resolution not sound. The marker is read only when the PR's line holds such a merge, and fails closed: a gh failure or a marker that does not parse refuses with "hq cannot tell …" (GEO-1501).

## 0.64.3 — 2026-10-20

- `hq review <repo> <pr> --fixes-only` and the gate's re-check now follow a rebase: when the last review that ran its lenses (L) is no longer in the PR head's history, hq maps L onto the rebased branch by git patch id, as noslop 4071fd4 does, and applies the fixes-only rule from that branch commit. A reviewed commit whose patch the base already holds (a stack whose base rebased too) is left out of the mapping. A `fixed <sha>` answer that names a commit the rebase rewrote counts the branch commit with the same patch id, if the repo still holds the old commit (GEO-1490).
- The mapping is refused with `fixes_only_no_fix` (`merge_blocked` at the gate), as "the last review (<sha>) does not map onto the rebased branch: <reason>", when the rebase changed a reviewed commit's patch, dropped or reordered one, the reviewed range or the branch commits it maps onto holds a merge, a reviewed commit is empty, the branch holds fewer commits past the base than the reviewed range, or the repo holds no commit of L (GEO-1490).
- Every new git read (`merge-base --is-ancestor`, `rev-list`, `show`, `patch-id`) fails closed with "hq cannot tell …" (GEO-1490).

## 0.64.2 — 2026-10-20

- `hq review gate` refuses with `merge_blocked` when noslop's check passes on a head the last review that ran its lenses did not read, unless every commit since is a named fix or a clean merge of the base, as `--fixes-only` requires; a git or gh failure in that check, a last review that stored no head, or a PR head GitHub gives neither in the gate's state read nor in `gh pr view --json headRefOid` refuses too (GEO-1506).
- The fixes-only rule from 0.64.1 now fails closed on every git read: a failed parent read, `git merge-tree` exit other than 0 or 1, tree read, or `git merge-base --is-ancestor` exit other than 0 or 1 refuses `--fixes-only` and the gate with "hq cannot tell …", where a failed parent read used to pass a merge as a named fix (GEO-1506).

## 0.64.1 — 2026-10-20

- When noslop has not read a PR's head after a review that ran its lenses, `hq review check` and `hq review gate` (and their `--json` error message) end with `To check the fixes on this head without a new round, run hq review <repo> <pr> --fixes-only.` when fixed answers and clean merges cover every commit since, and otherwise list those commits and say the head cannot pass until they are answered, moved or checked (GEO-1464); the gate still refuses with the same code and exit.
- `hq review <repo> <pr> --fixes-only` is refused with `fixes_only_no_fix`, before noslop runs, unless every commit on the PR's own line (first parent) after the last review that ran its lenses is named by a `fixed <sha>` answer or is a clean merge whose other parents are in the PR's base branch; the refusal lists up to 5 such commits, marks merges, and says how to clear each kind: answer an unnamed commit's finding with `fixed <sha>` or move the code to a new PR, have z-review check an unclean merge by hand, and move a merge of another branch to a new PR (GEO-1499).

## 0.64.0 — 2026-10-20

`hq pr status <repo> <pr>` is the one record every session reads before it messages about a PR (GEO-1454), so no session offers the owner a head the owner already turned down or sends the same request twice. It informs; it never blocks a message or a merge.

- The record holds the head hq last saw, the gate's result, the owner's answer (`lgtm`, `changes` or `reject`) with its source and note, and which session holds the next step. A gate or answer recorded at an older head shows as `stale at <short head>`, and `--json` carries `answerStale` and `gateStale`. When gh cannot give the head, the stored record prints and says stale is unknown.
- `hq pr answer <repo> <pr> lgtm|changes|reject --source chat:ID|console:ID|call:ID [--note T]` stores the answer at the PR's head now. It refuses a missing, empty or malformed `--source`, a `changes` with no `--note`, and a head gh cannot read, and stores nothing.
- `hq pr next <repo> <pr> <session>` names who holds the next step (a declared session, else refused with the list), or `--clear`; it refuses neither or both. It shows the record against the head gh gives now.
- `hq pr` keeps records for zgeoff's PRs only: `other-owner/repo` is refused, since the record keys on the repo name.
- `hq review gate` writes pass or fail to the record at the head its noslop check was keyed to. A pass noslop does not review (not a noslop repo, a bot's PR, on Codex) records gate `none` with no head and no gh call, shown as `gate: none (noslop does not review this PR)`. Its decision, output and exit code do not change, and a failed write never fails the gate.
- A console lgtm, Changes or Reject on a review item for a zgeoff PR also writes the answer, with source `console:<item id>`; the head read has a 60 s deadline, and if it fails the answer is stored as `head unknown` and the owner session is still told.
- Schema v35 adds `pr_status`. The upgrade backs up hq.db first.

## 0.63.0 — 2026-10-20

### Changed

hq speaks atc protocol 6 and needs atc 5.0.0; install hq and atc together (GEO-1487). The client now talks oRPC peer messages instead of the v4 line frames. A daemon on another protocol is refused as `atc_protocol_mismatch` naming both versions, and one that closes the hello with no answer is reported as speaking an older protocol. The answers hq reads from `session.get`, `session.spawn` and `session.message` are checked against the 5.0.0 contract.

## 0.62.0 — 2026-10-20

`hq review <repo> <pr> --fixes-only` checks the fixes pushed after a PR's last noslop round, and replaces `--confirm` (GEO-1477). Run `hq noslop pin c8d876e` (`@noslop/cli` 0.4.0) after installing: the flag needs noslop's fixes-only run.

- Added: `--fixes-only` runs `noslop review --fixes-only`, which runs no lens, raises no finding and writes the summary at the new head. hq reads review result version 7 and prints each fix check as `<finding id> fixed` or `<finding id> not fixed: <reason>`, then noslop's check state. `--json` carries `fixChecks`. It is not a round: it runs inside the cap and past it, with no limit per PR, and is stored like a `--confirm` review. It is refused before the PR's first review that ran its lenses, with `--full` or `--redesign`, and on a Codex repo.
- Removed: `--confirm`. It is refused with a pointer to `--fixes-only`. Stored `--confirm` reviews stay readable and still count as not a round in reports.
- The `round_cap` refusal now names `--fixes-only`.

## 0.60.3 — 2026-10-20

A run from source with `HQ_LIVE=1` may read and write the live hq.db, but it refuses to upgrade the live schema (GEO-1479). On 19 Oct such a run upgraded hq.db to v34 while the installed hq knew v33, and every installed hq command refused the database until 0.60.1 was installed: reviews, gates, the health probe and fleet respawns. The refusal names both ways out: install the build, or run on a copy with `HQ_DB`.

## 0.60.2 — 2026-10-20

`hq noslop report` counts a repeat-class finding only when it cites the same rule as an earlier finding on the PR (GEO-1435, z-stu's choice). A lens and criterion is too broad to be a class: `tests:untested-change` alone held 303 of 1,152 stored findings, so a second missing test on a PR counted as a repeat, and the figure could not reach its target of about 0. A finding that cites no rule is now neither a repeat nor unknown. Unknown stays for findings stored before hq kept a criterion.

## 0.60.1 — 2026-10-20

A fix pushed after a PR's last noslop round can count again (GEO-1464). noslop counts a `fixed <sha>` answer only once a review reads that commit, and its check needs a review at the PR's head. 0.60.0's cap refused that review, so such a PR could never pass `hq review gate`.

- `hq review <repo> <pr> --confirm` runs a review of the commits since the last round once the PR's rounds are spent. It is not a round, and a PR gets at most 2. It stands in for `--fixes-only` (GEO-1477) until noslop ships it.
- It is refused inside the cap, with `--full` or `--redesign`, on a Codex repo, and after 2 runs, each with the reason.
- The `round_cap` refusal now names `--confirm`.
- Schema v34 adds `noslop_rounds.confirm`. The upgrade backs up hq.db first.

## 0.60.0 — 2026-10-20

`hq review` caps the noslop review rounds on a PR at 1 or 2 (GEO-1464). The owner's decision: at most 2 noslop rounds on any PR, and 1 where the first review shows a small change.

- The first ok review decides the cap: 1 when noslop gave the PR a `docs-only`, `sync` or `release` route or reviewed it at depth `light`, else 2; a first review with no recorded depth gets 2, with the reason `first review depth unknown`. Round 1 always runs. A round past the cap is refused with `round_cap` (exit 1) before any worktree or noslop run, and the message names the cap and why. The cap check and the review run under one lock per PR, so a second `hq review` of the same PR waits (up to `HQ_REVIEW_LOCK_WAIT_MS`) for the first to record its round and is then judged against it, or gets `locked`. Failed reviews and checks never count as rounds. Codex repos are not capped. `hq review gate` is unchanged and still decides the merge.
- On round 2, `--full` is dropped: hq runs the delta review, says `--full dropped: round <n> reviews only the commits since round 1.`, and `--json` carries `fullDropped: true` and the `round`.
- Schema v33 adds `noslop_rounds.special`: NULL for a round from before v33, `none` when noslop gave no special route, else noslop's value. A round with a NULL special is decided by depth alone.
- `hq review <repo> <pr> --redesign <finding-id>` gives a noslop PR one round past its cap (cap 2 becomes 3, cap 1 becomes 2), once per PR, for a finding that forced a redesign of logic already patched in 2 rounds. It reviews only the commits since the last round. It is refused with `bad_redesign` on a Codex repo, with `--full`, for a finding id no ok review of the PR raised, and when the PR already had its redesign round. The `round_cap` refusal names `--redesign` while the PR has not used it.
- Schema v33 also adds `noslop_rounds.redesign`: the finding id on the redesign round, NULL on every other. `hq noslop report` shows `redesign: <finding-id>` for a PR that used it, and its JSON carries `redesign` (the id or null).
- `hq noslop backfill` also fills `special` on past ok review rounds from noslop's store, by repo, PR and head, in the same transaction and backup, and reports `specials filled`. It can be run again.

## 0.59.0 — 2026-10-19

`hq noslop report` counts review churn, and `hq noslop backfill` fills the past rounds it cannot count (GEO-1435). The report now says how many rounds kept finding new things, not only how many findings there were.

- Per PR and in a totals block, the report gives `roundsWithNew` (ok reviews that raised a finding id no earlier ok review had), `repeatClass` (findings first raised after the first review whose class an earlier review had already cited on another finding: the taste rule a finding cites, else its lens and criterion), `late` as `{ n, of }` (findings first raised after the first review that anchor in code the PR had not touched since its first review), and `mainMerge` (findings in code the PR did not write). Findings with no stored criterion or rule, late flag or written-by-change flag count in `classUnknown`, `lateUnknown` and `mergeUnknown`. `--json` gains `totals` beside `reports`. With `--since`, churn still reads each reported PR's ok reviews from before the cutoff, to know which findings and classes came earlier and which review was first, and counts only the reviews since the cutoff.
- Reviews now store each finding's `criterion`, `rule`, `path`, `startLine`, `endLine` and `writtenByChange`, and `late`, which `hq review` works out at record time with one `git cat-file` and one `git diff -U0` per path in the repo clone. A git failure leaves `late` null and never fails the review. No schema change.
- `hq noslop backfill [--store PATH] [--dry-run]` reads noslop's store (read-only; `--store`, else `HQ_NOSLOP_STORE`, else noslop's own default, `$XDG_DATA_HOME/noslop/store.sqlite` when `XDG_DATA_HOME` is set and absolute and `~/.local/share/noslop/store.sqlite` otherwise) and fills the criterion, taste rule, anchor and written-by-change flag of past ok review findings by repo, PR and head. It backs up hq.db first, writes in one transaction, can be run again, and never sets `late`.

## 0.58.0 — 2026-10-19

hq tells z-stu when lane slots sit free while the Ready count is stale (GEO-1452). On 19 Oct the newest Ready report was from 15 Oct, and nothing noticed.

- The lanes watcher sends z-stu one message when at least one slot is free and the newest Ready report is more than 2 hours old (`HQ_LANES_READY_STALE_MIN`, 120). It sends once per stale spell: a new report ends the spell, and only a later stale spell sends again. Quiet hours hold the message until the first look after them. With no Ready report at all, nothing is stale.
- `hq lanes ready --lane name=n,...` also sets the total Ready count, the sum of the fresh per-lane counts, so `hq lanes` no longer shows `ready count: unknown` beside fresh lane counts. `hq lanes ready --count N` still keeps the per-lane counts and detail.

## 0.57.1 — 2026-10-19

`hq fleet` no longer reports a false plugin folder mismatch for z-stu (GEO-1409). atc lists a `~/` folder expanded, as `/home/<user>/projects/hq/mods/hq-band`, and 0.57.0 compared it with fleet.json's `~/projects/hq/mods/hq-band` as written. Both sides are now expanded and resolved before the compare. `hq fleet ensure` never read the check, so the false mismatch caused no respawn.

## 0.57.0 — 2026-10-19

z-stu starts with the hq band loaded, and no other session loads it (GEO-1409). fleet.json gains an optional `pluginDirs` per session, and z-stu's is `["~/projects/hq/mods/hq-band"]`. `hq fleet ensure` passes the list to atc's `session.spawn`, which gives each folder to Claude Code as `--plugin-dir`. This needs atc 4.15.0 or later.

- fleet.json refuses a `pluginDirs` that is empty or holds a folder that is not absolute or `~/`, or has a `..` segment, as atc does.
- `hq fleet` reports a live session whose plugin folders differ from its entry's, for example `z-stu: plugin folders differ: declared ~/projects/hq/mods/hq-band, running none`. atc restarts a session with the folders it was spawned with, so only a respawn changes them. `hq fleet --json --prompts` puts the mismatch beside the entry as `pluginCheck`.

## 0.56.2 — 2026-10-19

hq warns when pacing.json's imp lanes, with every slot full, would cross impd's non-Nix line (GEO-1424). The plan is the sum of the imp lane sizes × `imp.impMib` against `nonnixMaxMib`, and the same slots × `impVcpus` against `nonnixMaxVcpus`, since impd refuses on either line. Being at a line is not over it. The plan counts lane sizes only: today's 7 imp slots take 14 of 16 GiB and 14 of 16 vCPUs, and the 2 GiB and 2 vCPUs left are the room for imps outside the lanes, such as z-qa checks and helpers.

- A new capacity alert, `lanes:plan`, opens and clears under the same hold rule as the others and goes to z-stu and the orchestrator. Quiet hours hold it, since it is not urgent.
- The band's lanes segment turns amber and names the line crossed, for example `plan 18/16 GiB`. The pane's Lanes section starts with the same warning in bold.
- `hq lanes` prints an `imp lane plan:` line: the room left for imps outside the lanes, or the warning.

## 0.56.1 — 2026-10-19

A `working` run moves to `merged` by itself once its work is in: a PR merged, no PR open, and no active session left (GEO-1412). The merge and the session's end come in either order, so hq checks at `hq run merged`, at `hq run session … --remove`, and when the sweep ends a gone session. Before, a run whose agent forgot `hq run state … merged` stayed `working`.

## 0.56.0 — 2026-10-19

z-stu's band gains `/hq` (GEO-1351), a pane with the detail behind the band, read with the band each minute:

- what needs the owner, each item with its links, and a link to the console;
- Nix, up, down, or unknown with the reason (no probe sample in 5 minutes, or a blind newest sample), the same rule as the band's `Nix ?`, and its minutes down today;
- a heat map of the lanes, one cell per slot, with the runs that hold each slot (a parked run named, holding none);
- reviews in flight, each PR a link with its round and start time;
- what hq saw merge since Sydney midnight, with a link to the console's Shipped tab;
- the 5 newest news lines.

`hq pane [--json]` builds the pane's Markdown and heat map from what hq already stores, so the mod only draws them. The command exists only in z-stu's session; anywhere else the mod stays inert as before.

## 0.55.2 — 2026-10-19

A gone session no longer holds a lane slot (GEO-1410). Before, a `working` run whose sessions atc no longer listed still counted against its lane. Now:

- A working run whose sessions are all gone is parked, as a blocked run with no session awake already is. An asleep session counts as present.
- "Gone" is judged only from a fresh atc reading, and a session added in the last 5 minutes (one sweep) is never gone.
- The sweep ends each run session atc no longer lists and marks it in the new `run_sessions.ended_by` column (schema v32). Re-attaching the session clears the mark.
- A working run with no active main session, whose last main session the sweep ended, keeps its repeating "exited" alert, unless every open PR is final and reviewed at its head. `hq run session <issue> <id> --remove` clears the mark and ends the alert. A session ended by hand raises none.

A slot freed in an imp lane is still held while impd is at its non-Nix line.

## 0.55.1 — 2026-10-19

Fixes for true findings that noslop raised on main's code before its GEO-1394 fix (GEO-1423):

- `hq review gate` parses GitHub's answer about the PR through one schema. An answer that lacks the base, a list, or an edit time now runs a fresh check instead of reusing a stored one. The first gate after the upgrade can run a fresh check once.
- The band's code names say what the functions do: `loadSessionName` runs `hq whois`, and `buildImpdLine` decides the amber tone.
- The 0.55.0 entry now says the band reads each workflow's newest completed push run.
- New tests: a stale impd reading in the band, a failed 1Password read of the Linear key, the quiet-hours guard's refused and allowed times, and the watcher's audit record for the Linear key read. The band's tests now each write their own records.

## 0.55.0 — 2026-10-19

z-stu gets a fleet band (GEO-1351): one line above its prompt, read every minute. It shows what needs the owner, Nix's health, lane use against impd's line, CI, and reviews in flight. The band is a Claude Code mod in `mods/hq-band`; its README says how to load it for z-stu alone.

- `hq band [--json]` gives that line from what hq already stores, with a tone for each segment. Red: something needs the owner, Nix has an open outage, or a workflow's newest completed push run of the last 24 h failed. Amber: one more imp would cross impd's memory or vCPU line, or hq can't tell (no probe sample in 5 min, no impd reading in 15 min, no CI stored in 2 h, a pacing.json it refuses).
- `hq whois <session-id>` names the declared fleet session hq fleet last saw under an id. The mod runs it once at start and stays inert unless the answer is z-stu, so a wrong load starts no timer and draws nothing.
- `bun test` skips `mods/`; `claude plugin test` runs the mod's own tests. Lint turns off `unicorn/no-array-method-this-argument` there, since it reads `$.clock.every(ms, fn)` as an array method.

## 0.54.15 — 2026-10-19

The merge gate stores a fresh check for reuse only when it can show the check read the PR state it is stored under (GEO-1390). Before, a push during the check could store noslop's answer for one head under another head's key, and a later gate on that head would pass it unreviewed. Now a check's answer is stored only when both hold:

- The key's head carries a noslop check run newer than the one before the check, with the same conclusion.
- The PR reads the same key again after the check.

Otherwise the answer is stored under no key. A refusal of a missing `deferred` issue is never reused, even when the issue reference has spaces.

## 0.54.14 — 2026-10-19

The weekly audit counts a noslop 1Password read even when its answer fails validation (GEO-1392). `loadNoslopSecrets` records the read once op answers, before it checks the fields. Tests now cover the `1Pass` line in `hq capacity` for a reading, a spent limit, op rate-limited and op failing. `formatOpDay` is renamed `loadOpDay`.

## 0.54.13 — 2026-10-19

The merge gate's reuse of an unchanged PR's check (0.54.8) no longer reuses a refusal that names a `deferred` issue as missing. Creating that issue changes nothing in the PR's state, so the old refusal would stand forever. `findGateCheck` is now `loadGateCheck`. New tests cover an edited review, an edited thread reply, and the query fields that catch those edits.

## 0.54.12 — 2026-10-19

The weekly audit message counts 1Password requests per Sydney day (GEO-1392). Each line gives the account's highest reading from the capacity samples, hq's own reads by consumer (noslop, Linear), and the rest as "other". "other" is approximate, because 1Password's day resets on its own clock.

- Each real 1Password read hq makes records an `op` `read` event with its consumer and its cost: 1 request for noslop's read by ID, 3 for the Linear key's read by name. A cached Linear key records nothing.
- `linearCaller` is now `makeLinearCaller`, and takes the read recorder as its third argument. hq's commands use `makeAuditedLinearCaller(db, run)`, which records each read.

## 0.54.11 — 2026-10-19

`hq capacity` shows the 1Password account's requests today against its daily limit, and alerts on them (GEO-1392). Each watcher tick reads `op service-account ratelimit`, which costs no request, with the global profile's token. Two new alerts:

- `op:daily`: at or over `opDailyPct` (default 50%) of the daily limit. `hq capacity set opDailyPct N` changes the line.
- `op:refused`, urgent: 1Password rate-limits the read, or any limit, the token's hourly one included, has nothing left.

Like every capacity alert, each must hold for `holdSamples` ticks (2 by default) before it is sent. Schema v31 adds `op_account_used`, `op_account_limit` and `op_refused` to `capacity_samples`.

## 0.54.10 — 2026-10-19

Two hq processes that open hq.db at once after an install no longer race through the schema upgrade (GEO-1399). On 19 Oct, one `hq grant act` failed with "duplicate column name: state_key" while 0.54.8 installed. Each migration step now reads the schema version again inside its own write-locked transaction, so a second process skips what the first applied. Each process's pre-upgrade backup carries its pid, so two never write one file, and `busy_timeout` is set before the switch to WAL, so a new database's first opens wait instead of failing. A test starts 4 hq processes on one database 5 versions behind, 4 times over. On the old code it fails with the same duplicate-column error.

## 0.54.9 — 2026-10-19

hq's in-memory Linear key now expires after 12 hours (GEO-1392). It used to stay for the life of the process, so the long-running watcher read 1Password once and then never again while Linear kept answering, and a rotated key reached it only through a 401. Codex found this while reviewing the secret-cache plan. Each hq command still reads the key once, as before.

- hq gets one MSW server (`mocks/node.ts`, MSW 2.15.0; 3.0.3 cannot patch Bun 1.4.2's fetch), started for every test by `test/msw-preload.ts`. A request to a host no handler names fails its test; loopback servers pass through. The key-expiry test runs the real client against its Linear handler.

## 0.54.8 — 2026-10-19

`hq review gate` skips the noslop check when nothing on the PR has changed since an earlier gate's check (GEO-1390). Before a check runs, one `gh` GraphQL call reads the PR's head, base, comments, reviews and review threads. hq hashes that with noslop's pinned version. If the newest check that gave an answer has the same key, the gate answers from it, with no noslop run and no 1Password read, and its reason ends `(no change since the check at <time>)`. A new commit, base, finding, reply or edit, a new noslop pin, or GitHub not answering runs a fresh check. `hq review check` always runs fresh. Schema v30 adds `state_key` and `title` to `noslop_rounds`.

## 0.54.7 — 2026-10-19

A noslop round reads its GitHub App secrets with one `op item get` by item and vault ID, instead of three `op read` calls by name (GEO-1389). 1Password counts a lookup by name as 3 requests and one by ID as 1, so a round drops from 9 requests to 1. On 18 Oct the fleet ran about 100 rounds an hour on one service-account token, and 1Password rate-limited it, so every gate failed with "1Password gave no app-id for noslop". A rate-limited answer now says so: `1Password gave no app secrets for noslop (exit 1): 1Password rate-limited the request; op service-account ratelimit shows which limit and when it resets`. Caching across hq calls is GEO-1390.

## 0.54.6 — 2026-10-19

`transitions.ts` and `linear.ts` split into folders of one-export modules (GEO-1288), 24 modules in all. No behaviour or message text changes. The transitions test's scan now accepts a writer that imports from `src/transitions/`, and still fails one that imports neither the table nor `check-unblock.ts`. `linear.ts` kept its Linear key in a module-level variable that two exports shared; it is now a `KEY_CACHE` holder in its own module, still in memory only and dropped on a 401 or 403. As before, a helper whose name lacks a verb gets one at its declaration while its callers keep the old name: `store` is `writeIssues`, `forgetKey` is `resetKey`, `typeOf` is `pickIssueType`; `TYPES` is `ISSUE_TYPES`, since `types.ts` holds the shared types.

## 0.54.5 — 2026-10-19

`hq run add` refuses a second word after the issue (GEO-1386). A session id given there was dropped without an error, so the run had no session, and hq, which matches each atc note to a run through its sessions, never saw that run's notes or FINALs. The error names the right form: `hq run add takes one issue: pass the session as --session <id>`.

## 0.54.4 — 2026-10-19

Thirteen modules split into folders of one-export modules (GEO-1288): `outbox`, `morning`, `kinds`, `defs`, `roles`, `followups`, `marks`, `pins`, `typed`, `stats`, `sizes`, `skillcheck` and `lanes-unit` become 136 modules. Nothing else changes: no behaviour and no message text; only the import paths move. As in 0.54.3, a helper two exports share becomes its own module, and one whose name lacks a verb gets one at its declaration while its callers keep the old name: `originOf` is `readOrigin`, `systemctl` is `runSystemctl`, and five more. Three one-line exports that lint now sees whole get verbs the same way: `declaredSessions`, `declaredForwards` and `cutoff` are `getDeclaredSessions`, `getDeclaredForwards` and `getCutoff`.

## 0.54.3 — 2026-10-19

Seven operations modules split into folders of one-export modules (GEO-1288): `health`, `backup`, `restart`, `repair`, `watcher`, `runner` and `rc` become 77 modules. Nothing else changes: no behaviour and no message text; only the import paths move. A helper two exports share becomes its own module. A helper whose name lacks a verb gets one at its declaration, and its callers import it under the old name, so the moved code stays as it was: `restic` is `runRestic`, `parse` is `parseTranscript`, and six more. `health.ts`'s `export type { Key as HealthKey }` becomes `export type HealthKey`. Two tests import from the new paths: the runner test's child script, and the health test's timeout, now a static import.

## 0.54.2 — 2026-10-19

Ten shared modules split into folders of one-export modules (GEO-1288): `db`, `clock`, `config`, `redact`, `trust`, `send`, `accounts`, `ghauth`, `capabilities` and `scope` become 43 modules. Nothing else changes: no behaviour and no message text; only the import paths move. A helper two exports share becomes its own module, with a name the function-verb rule takes: `getSydneyParts`, `parseSemver`, `ACCOUNT_NAME_RE`, and `isInScope`, since `inScope` and `IN_SCOPE` would share one file name. `cli.ts` no longer re-exports `send`; its one user imports it from `src/send/send.ts`. A few lines the renames touched gain braces or a `u` flag, as lint asks of changed lines.

## 0.54.1 — 2026-10-19

`src/news.ts` becomes 11 modules in `src/news/`, one export each, with its shared types in `src/news/types.ts` (GEO-1288). Nothing else changes: no behaviour, no message text, and no test checks anything new; only the import paths move. `TAG_RE`'s group is now non-capturing with the `u` flag, as lint asks of a line it sees as new; it matches the same tags.

## 0.54.0 — 2026-10-19

Each Shipped row is drawn from data, not from the report's Markdown line (GEO-1363). hq runs the delivery-report skill's `render-report.sh --json`, so the skill still picks the groups, rows, order and markers. Each row has two lines. The first holds the markers, the issue id and title, and the state pill on the right; the title stays on one line and shows whole on hover. The second holds one `repo#n` chip per PR, linked to the PR, starting under the title on every row and wrapping when there are many. A PR with no issue shows its repo and title, with its chip below. The pill shows the Linear status while the issue is open, Canceled when canceled, and nothing when done. The page no longer parses Markdown, so the escaping in GEO-1354 no longer affects it.

## 0.53.0 — 2026-10-19

The console's tabs answer the keyboard on every tab (GEO-1362): `g n` opens Needs you, `g s` opens Shipped, and `[` and `]` step to the previous and next tab. A `g` waits 1.5 s for its second key. Each tab's header shows its jump key, and `?` lists the current tab's keys with the shared ones; Shipped gains that list and `Esc` to close it. No tab key fires in the note box or with a modifier.

## 0.52.0 — 2026-10-19

A lane that pacing.json's new top-level `lends` maps to false neither lends its free slots nor borrows another's, in `hq lanes` and in the watcher's nudges (GEO-1355). It is for lanes fed only from their own set: glm, cleanup and memory. `lends` is a map, `{ "glm": false }`, rather than a field on each lane, because capacity.sh reads each lane's value as its size. Absent, every lane lends as before. An unknown lane or a value that is not true or false is refused.

## 0.51.0 — 2026-10-19

hq reads noslop's review output version 6 (noslop#15, GEO-1341), and still reads 4 and 5. Version 6 lists the changed files no noslop call read, data files and files too large for a call; `hq review` prints them under "not reviewed by noslop", so z-review checks them by hand. A version 6 output without that list is no review.

## 0.50.0 — 2026-10-18

The console gains a Shipped tab (GEO-1349): what merged today, yesterday or this week, in Sydney time, as the delivery report lays it out. `t`, `y` and `w` switch the period.

- The server runs the delivery-report skill's own `merged-prs.sh` and `render-report.sh`, and reads the issues and the projects' burndowns from Linear, so the tab keeps no rules of its own. Each period's report is kept 5 minutes.
- The report's markdown is drawn as headings, lists and links; a link that is not https stays text.
- `/shipped` serves the same page, behind the same Host and Origin check.

## 0.49.1 — 2026-10-18

The vCPU line's default, `nonnixMaxVcpus`, rises from 12 to 16: eight 2-vCPU imps, as before 0.49.0 (GEO-1345). impd now runs imps at a lower CPU priority than Nix, so the line is a backstop only.

## 0.49.0 — 2026-10-18

An imp lane's slot is free only while the awake non-Nix imps' vCPUs, plus one more imp, stay under a vCPU line, beside the memory line of 0.47.0 (GEO-1345). The tightest of the budget, the memory line and the vCPU line sets the slots, and `hq lanes` names it (`held: impd at vCPU line`).

- Capacity settings gain `nonnixMaxVcpus` (12: six 2-vCPU imps on the cloud host's 8 cores) and `impVcpus` (2).
- Schema v29 adds `capacity_samples.nonnix_awake_vcpus`, counted from `impz ls`. A sample without it, or with an awake imp that reports no vCPUs, holds every slot, as a stale sample does.
- `hq capacity` prints the awake non-Nix vCPUs beside their MiB.

## 0.48.0 — 2026-10-18

`hq typed add --source console:<id>` logs a line z-stu types into a session to relay a console answer (since hq#210). The id must be a call, proposal or unblock item that hq holds. Schema v28 copies the `typed` table into one whose CHECK allows `console`, keeping every row and id; the upgrade backs up hq.db first. `hq answers` lists these lines with `console:<id>` as their source.

## 0.47.1 — 2026-10-18

The classifier-refusal log moves into `src/refusals/`, one export per file, named for it (GEO-1288, part 4). `refusals.ts` is gone, with no shim. Path-only: no behaviour, message text or test assertion changes.

- Exports whose names the naming lint refuses take new names, and callers import them under the old ones: `refusalRows` becomes `loadRefusalRows`, `tally` becomes `countRefusals`, `refusalLine` becomes `formatRefusalLine`, and `refusalsSummary` becomes `loadRefusalsSummary`.
- The private helpers that two modules share each take their own module: `parseJSONLine`, `findString`, `formatWho` and `MARK`. So do the exported scan constants.
- The scan yields between reads with `Bun.sleep(0)` instead of a hand-built zero timeout.

## 0.47.0 — 2026-10-18

An imp lane's slot is free only when impd's non-Nix line has room for one more imp (z-stu). At 10:33Z the budget showed 4,096 MiB free, but 8 non-Nix imps already filled the 16,384 MiB line, and a launch into a lent slot went over it.

- Free imp slots are now the lesser of the budget room and floor((nonnixMaxMib − awake non-Nix MiB) / impMib). The awake figure comes from the newest capacity sample.
- The line is the capacity watch's own `nonnixMaxMib`, override included, so the alert and the lanes never disagree.
- With no capacity sample from the last 15 minutes, or one with no impd reading, every imp slot is held.
- `hq lanes` prints the line (`impd non-Nix line: 16384/16384 MiB awake; 0 imp slot(s) to fill, set by impd at line`). It also prints, on each lane it holds back, `(1 free by lane, held: impd at line)`. The watcher's nudges go by the same counts.
- docs/sessions.md says so.

## 0.46.4 — 2026-10-18

Release tracking moves into `src/releases/`, one export per file, named for it (GEO-1288, part 4). `releases.ts` is gone, with no shim. The `repo#n` helpers become `getRepo` and `getPRNumber`, and the watcher's due check becomes `isShipPassDue`; callers import them under their old names. The constants `shipRuns` reads each take their own module. No behaviour changes.

## 0.46.3 — 2026-10-18

The owner's unblock list moves into `src/unblock/`, one export per file, named for it (GEO-1288, part 4). `unblock.ts` is gone, with no shim. The row reader takes its own module as `parseUnblockRow`, imported under its old local name `hydrate`, and the sequence counter that only `addUnblock` reads sits after it. Paths and imports only: no behaviour change.

## 0.46.2 — 2026-10-18

`src/wake.ts` becomes 13 modules in `src/wake/`, one export each, with its shared types in `src/wake/types.ts` (GEO-1288). Nothing else changes: no behaviour, no message text, and no test checks anything new; only the import paths move.

## 0.46.1 — 2026-10-18

Unblock items get a declared transition table, as asks, runs and run PRs have. This comes before `src/unblock.ts` splits into modules, so they share one rule. `UNBLOCK_TRANSITIONS` (added, updated, reopened, done, dropped) lives in `src/unblock-transitions.ts`. `checkUnblock` refuses a move the table lacks, and `addUnblock` and `closeUnblock` both call it. No behaviour changes: the refusal still reads `<id> is done, not open`. The transitions test checks each move against the table, runs each one through the real functions, and its scan now also catches writes to `unblocks.state`.

## 0.46.0 — 2026-10-18

GEO-1328: the actions taken under each standing grant, for the weekly report. Schema v27; the upgrade backs up hq.db first, as each one does.

- A `grant` mark may carry a short unique name: `hq mark add --kind grant ... --grant NAME`, or `hq mark grant ID NAME` for the grant marks already recorded. A name can change until an action uses it.
- `hq grant act NAME --target ISSUE|PR|COMMAND [--note T]` records an action under a named grant; a name no mark carries is refused with the names that exist. Actions are only ever appended.
- `hq grant actions [--since 7d]` lists every named grant with its actions in the window, one line each. A grant with none says "none", as an unused grant is the plainest one to pull back.
- `hq mark drop` refuses a named grant that has actions, so they keep their grant.
- docs/sessions.md: a section on acting under a standing grant.

## 0.45.0 — 2026-10-18

GEO-1327's hq half, for the weekly audit's answer-pattern step.

- `hq answers [--since 7d]` lists the owner's answers in the window, oldest first: each call or proposal answer (one per round), each console review, and each line typed into a session in the owner's name. With `--json`, each row carries its source, id, kind, title, issues, session, the option picked, whether it was Stu's pick, the owner's words, a ref (the review's PR or the typed line's source) and who recorded it. An option is picked only when the answer is the console's `<label>` or `<label> | <note>`; an answer typed at the terminal picks nothing and is all words. A to-do's Done, Later or Skip is a task, not a decision, so it is not listed.
- `hq stats` gets a section after "Wait on the owner": the calls, proposals and reviews the owner answered in each of the last 4 Sydney weeks, so a standing grant shows as a drop. Typed lines are left out of the count, as they relay an answer already counted.

## 0.44.0 — 2026-10-18

A blocked run with no session awake now frees its lane slot whatever it waits on, not only when it waits on the owner (z-delivery's feedback, z-stu's call). Runs blocked on another issue with their sessions gone held nixie slots that no agent used. The guards stay: a session awake and busy holds the slot, and with no fresh reading of who is awake every run counts. `hq lanes` labels them "parked, not counted (blocked, no session awake)". `--waits-on-geoff` still marks the owner's waits for `hq stats`.

## 0.43.5 — 2026-10-18

The start-prompt and definitions-source code moves into `src/prompts/`, one export per file, named for it (GEO-1288, part 4e). `prompts.ts` is gone, with no shim. The fetch cache that `fetchMain` and `resetFetchCache` share is now `FETCH_STATE` in its own module. The workspaces root is written inline in `DEFS_SOURCES`, still once in hq's source. The test that checks it is written once now scans `src/` recursively, skipping tests, and expects `prompts/defs-sources.ts`; a test-first PR can't carry that, since the file only exists after the split. `test/defs.test.ts` loads `DEFS` with a top-level import. `DEFS` and `rolePrompt` keep their names and arrows, with a lint exception that names GEO-1318. No behaviour change.

## 0.43.4 — 2026-10-18

The atc protocol-mismatch errors now point to `src/atc/`, where the client lives since 0.43.3, not to the old `src/atc.ts`. The text changes, and so do the 3 test assertions that quote it.

## 0.43.3 — 2026-10-18

The atc client moves into `src/atc/`, one export per file, named for it (GEO-1288, part 4d). `atc.ts` is gone, with no shim. Every moved line keeps its text, apart from the private `eventsPage` paging fields, which every events schema shares and so take their own module, and the private `Waiter` type, now an interface. Requests, message text and the protocol errors are unchanged; the errors still say "Update hq's src/atc.ts", which a later change can point at `src/atc/`. Paths and imports only: no behaviour change.

## 0.43.2 — 2026-10-18

The lanes watcher moves into `src/lanes/`, one export per file, named for it (GEO-1288, part 4c). `lanes.ts` is gone, with no shim. Every moved line keeps its text; two tests now import `readCapacity` and `LANES` at the top instead of loading them inside the test. Paths and imports only: no behaviour change.

## 0.43.1 — 2026-10-18

Calls and proposals move into `src/asks/`, one export per file, named for it (GEO-1288, part 4b). `asks.ts` is gone, with no shim, and its `AskState` re-export goes (callers import it from `transitions.ts`). `logEvent` and `owner`, which every area uses, move to `src/log-event.ts` and `src/owner.ts`. Private helpers take their own modules under verb names (`parseAskRow`, `requireAsk`, `sendNoticeIfOther`, `updateAskState`), imported under their old local names; `sendNoticeIfOther` and `updateAskState` take one options argument. `applyAsk` and `skipAsk` keep their positional signatures, with a lint exception that names GEO-1318. Paths and imports only: no behaviour change.

## 0.43.0 — 2026-10-18

In the console, a review item answers in review words (GEO-1324, decision D-review-words). An unblock item whose `--item` links mark a PR `"subject": true` (0.42.0) shows as a Review with four buttons: **lgtm** (`1`), approving the merge, a note going along as tweaks to make first; **Changes** (`2`), which needs a note; **Later** (`3`), as for a to-do; and **Reject**, which has no number key. Each answer reaches the owner session as `console answer: review <id>: <answer>`, the label and the owner's note verbatim, for z-stu to relay. lgtm and Changes close the item done (the owner did the review, and the waiting sessions hear their answer); Reject drops it, and hq never touches the PR itself. hq refuses Changes with no note, a review answer on a to-do, and Done or Skip on a review. To-do items keep Done, Later and Skip.

## 0.42.1 — 2026-10-18

The test that no session-name literal sits in `src/` outside `roles.ts` now scans `src/` recursively, so code that GEO-1288 moves into area folders stays covered. Tests beside their modules are skipped, as they were in `test/`. Test only.

## 0.42.0 — 2026-10-18

An unblock item about a PR now leaves the owner's list by itself once the PR merges or closes (z-steward, from z-triage's feedback: two review items stayed open about 35 minutes after their PRs merged). In `--item`, an unblock item marks the PR it is about with `"subject": true` on that link. hq refuses the mark on a link that is not a GitHub pull request URL, on more than one link, and on a call or proposal. Every 10 minutes the watcher asks GitHub for each marked PR's state; a merged or closed PR drops its item, with the note "owner/repo#n merged on GitHub" (or closed). Dropped, not done, so no session hears that the owner did it. A link without the mark, given as context, never drops an item, and a failed read leaves the item open. A plain `hq unblock add --task` over an item filed with `--item` now clears its stored title and fields, even when the task is unchanged, so an old subject PR can't drop the new task; `--item` re-adds keep theirs.

## 0.41.13 — 2026-10-18

The capacity watch moves into `src/capacity/`, one export per file, named for it (GEO-1288, part 4a). `capacity.ts` is gone, with no shim. Shared private helpers take their own modules under verb names (`getReadMS`, `formatError`, `waitWithDeadline`, `parseSampleRow`, `formatNumber`, `formatGiB`), imported under their old local names, so the bodies keep their lines. Exports that broke the verb rule take verbs: `capacityLine` becomes `loadCapacityLine`, `evaluateCapacity` `checkCapacity`, `storeSample` `writeCapacitySample`, `ciMinutesToday` `countCIMinutesToday`. Constants that one function reads became its locals. Paths and imports only: no behaviour change.

## 0.41.12 — 2026-10-18

The runs code (run rows, their sessions and PRs, the note feed and the sweep) moves into `src/runs/`, one export per file, named for it (GEO-1288, part 3e, the last area). `runs.ts` is gone, with no shim, and its `RUN_STATES` and `RunState` re-exports go (callers import them from `transitions.ts`). Shared private helpers take their own modules under verb names (`requireRun`, `requireOpenRun`, `requirePR`, `updateRunTime`, `updateRunSessions`, `registerRunPR`, `requireLiveCheck`, `countMinutesSince`), imported under their old local names, so the bodies keep their lines. `markFinal` becomes `scheduleFinalReview` and takes one `FinalMark` argument; `SWEEP` becomes `SWEEP_MINUTES`; regexes and constants that one function reads became its locals. The ASCII-only regexes without `i` take the `u` flag, which matches the same strings; `FINAL_PHRASE` keeps `i` alone, since `u` with `i` adds Unicode case folding. Paths and imports only: no behaviour change.

## 0.41.11 — 2026-10-18

The test that every state-column writer imports the transition table now scans `src/` recursively and accepts `../transitions.ts`, so it keeps its coverage once GEO-1288 moves the run writers into `src/runs/`. Test only.

## 0.41.10 — 2026-10-18

The fleet code (declared sessions, prompt drift, `hq fleet ensure` and the Remote Control helper) moves into `src/fleet/`, one export per file, named for it (GEO-1288, part 3d). `fleet.ts` is gone, with no shim, and its `readPrompt` re-export goes (callers import it from `prompts.ts`). Shared private helpers take their own modules under verb names (`getHome`, `loadDeclaredFleet`, `loadRcPending`, `updateRcPending`, `checkRcMarker`, `formatStep`); `fleetLast` becomes `loadFleetLast`, beside its `FLEET_LAST_SCHEMA`, imported under their old local names where a dense line uses them, so `ensureOnce` keeps its lines. `checkRcMarker` takes one options argument; constants that one function reads became its locals. `test/fleet.test.ts` and `test/drift.test.ts` stay in `test/`, imports only. Paths and imports only: no behaviour change.

## 0.41.9 — 2026-10-18

The Codex review code moves into `src/review/`, one export per file, named for it (GEO-1288, part 3c). `review.ts` is gone, with no shim; `review-command.ts` keeps its place. Its types join `src/review/types.ts`; the shared `must` becomes `runCommand` (imported under its old name in `review.ts`), `changedLines` becomes `collectChangedLines`, the risk tables and `CODEX_UNAVAILABLE` take their own modules, and the lock limits became locals. The gate patterns become locals of `allowDenyNeeded` with non-capturing groups and their `i`-only flags kept (a lint disable says why): adding `u` to a case-insensitive pattern would change Unicode case folding and `\b`. Its tests sit beside their modules. Paths and imports only: no behaviour change.

## 0.41.8 — 2026-10-18

The lanes-by-area code moves into `src/areas/`, one export per file, named for it (GEO-1288, part 3b). `areas.ts` is gone, with no shim; its types join `src/areas/types.ts`. `signature` became `buildLanesSignature`, the awake-reading schema and `RUNNING` take their own modules, and `FLEXIBLE`, `MAX_SKIPPED`, `AWAKE_FRESH_MIN` and the lane-name pattern became locals of the function that reads them. `test/areas.test.ts` stays in `test/`, since it drives the lanes watcher too. Paths and imports only: no behaviour change.

## 0.41.7 — 2026-10-18

The Nix probe moves into `src/probe/`, one export per file, named for it (GEO-1288, part 3a). `probe.ts` is gone, with no shim; its types join `src/probe/types.ts`, and the shared Sydney clock format becomes `format-clock.ts`. The URLs, `FETCH_MS` and `GAP_MIN` became private to the module that uses them, and `UNREADY_AFTER_MIN` a local in `probeOnce`. Its tests sit beside their modules. The config test's guard against `HQ_` reads outside `config.ts` now skips test files, since the probe tests set them and now sit under `src/`. Paths and imports only: no behaviour change.

## 0.41.6 — 2026-10-18

The daily check-in and the weekly review move into `src/goals/daily/` and `src/goals/weekly/`, one export per file, named for it (GEO-1288, part 2d, the last of the goals area). `goaldaily.ts` and `goalweekly.ts` are gone, with no shim. `FRESH_MIN`, `GOAL_NAMES`, `goalsAge`, `stale` and the shared `isPast` sit in `src/goals/`; each folder keeps its own `JOB`, `getRun` and `scheduleDaily` or `scheduleWeekly` (was `queue`, now one options argument); `getMondayKey` replaces `mondayKey`. The dead `FRESH_MIN` re-export from the weekly module is dropped, and `FLAG_TAG` became private. `measure.ts` now puts its helpers below its export. Paths and imports only: no behaviour change.

## 0.41.5 — 2026-10-18

The goals sync and rows move into `src/goals/`, one export per file, named for it (GEO-1288, part 2c). `goals.ts` is gone, with no shim; its 17 exports take a module each, `GoalRow` and `DeployOutcome` join `src/goals/types.ts`, and `HOLD_STEP` and `APPLY_STEP` became private to `classify-deploy.ts`. Helpers that several modules share get their own: `readGhJSON` (was `ghJson`), `upsertGoalDay` (was `markDone`, now one options argument), `toUTCDay`, and the `NAME`, `ISO_Z` and `FAILED` constants, and private helpers move below the export that uses them. `repos` became `loadRepos`, since lint reads every changed line. Its tests sit beside their modules. Paths and imports only: no behaviour change.

## 0.41.4 — 2026-10-18

The goal measures move into `src/goals/`, one export per file, named for it (GEO-1288, part 2b). `goalcheck.ts` is gone, with no shim: `measure.ts`, `verdict.ts`, `sample-usage.ts`, `account-key.ts`, `get-cache-dir.ts`, `get-usage-cache.ts` and `get-usage-dir.ts` take its exports, and its types join `src/goals/types.ts`. Its tests sit beside their modules. Paths and imports only: no behaviour change.

## 0.41.3 — 2026-10-18

The goal targets move into `src/goals/`, one export per file, named for it (GEO-1288, part 2a). `targets.ts` is gone, with no shim: `goal-keys.ts`, `ops.ts`, `types.ts`, `default-targets.ts`, `goal-targets.ts`, `set-target.ts` and `target-line.ts` take its exports, and the shared read of meta `goal_targets` becomes `load-stored-targets.ts`. `targetText` became the private `formatTarget` in `set-target.ts`. Its tests sit beside their modules. Paths and imports only: no behaviour change.

## 0.41.2 — 2026-10-18

`lint:changed` skips code a branch only moves (GEO-1288; z-stu's pick). An added line counts as moved when it matches a line the branch deletes, in any file, inside a run of 3 or more such lines in a row; a moved line that was edited, and a short chance match such as a lone `return null;`, are still linted. A new file is still linted whole apart from its moved lines. The GEO-1288 splits stay path-only; the legacy lint debt is tracked in GEO-1318. hq itself does not change.

## 0.41.1 — 2026-10-18

The noslop area moves into `src/noslop/`, one exported function per file, named for it, as the code-style skill asks (GEO-1288, part 1). Its 7 files (`noslop.ts`, `noslop-run.ts`, `noslop-issue.ts`, `noslop-pin.ts`, `noslop-report.ts`, `noslop-command.ts`, `review-noslop.ts`) are gone, with no shims; each test sits beside its module. Paths and imports only: no behaviour change, and the suite runs the same 1,140 tests and 5,160 assertions.

## 0.41.0 — 2026-10-18

`hq console [--port N]` serves a local page where the owner answers calls, proposals and to-dos one at a time, with one click or one key (GEO-1290, console slice 1; z-stu owns the design).

- The server is `Bun.serve` on 127.0.0.1 with a typed oRPC API: `items.list`, `items.answer` and `unblock.mark`. Every request, page files included, must carry the console's own `Host`, and no `Origin` or its own; anything else gets 403. No response may load in another site's frame (`X-Frame-Options: DENY` and `frame-ancestors 'none'`).
- An answer is stored as `<label> | <note>`, the label alone, or the note alone, verbatim. With nothing else open, the item opens and is answered as `hq call open` and `hq call answer` would. While another item is open with the owner, it goes straight to answered under a new transition, `answered-unopened`, and the open one stays open.
- A to-do's Done and Skip close it as `hq unblock done` and `drop` do; Later puts it off to the next morning.
- Each answer sends the owner session one message, `console answer: <kind> <id>: <answer>`. If it fails, the answer stays recorded, the page shows an orange toast, and the outbox retries.
- The page is React with TanStack Router and Query, built by Bun into the binary, with Geist bundled from npm. It follows the Main and MainDark boards, light and dark, with the keys `1`–`9`, `y`, `i`/`Esc`, `Enter`, `j`/`k` and `?`.
- `lint:changed` now lints `.tsx` files too.

## 0.40.1 — 2026-10-18

The watcher tells the owner session "Weekly audit due" on Monday from 09:00 Sydney, with the window: the 7 Sydney days before that Monday, in Sydney and UTC time (z-stu; the owner said yes to a weekly audit; GEO-1291). It is one `job_runs` row per week, keyed by the Monday's date, queued in one write transaction, so it sends once. It sends only on the Monday, so a first install mid-week sends nothing. A first tick after 09:30 marks it late ("late: hq did not run at 09:00", and `detail: late` on the run). Neither the first send nor an outbox retry goes out in the quiet hours (03:00–07:00 by default): the outbox holds this message until they end.

## 0.40.0 — 2026-10-18

Console slice 1, part 1: calls, proposals and unblock items carry the console's structured fields (z-stu). Nothing reads them on screen yet; `hq console` comes in the next release.

- Schema v26, with the usual hq.db backup first: `asks` gains `item` (the JSON fields) and `stu_view`; `unblocks` gains `item`, a short `title` and `due_at`.
- `hq call|proposal add <id> --item <file|->` and `hq unblock add --item <file|->` take one JSON item: `title` (80 characters at most), `question`, `deadline?`, `time?`, `options[{label, effect, recommended?}]`, `stuView?`, `details[{heading, text, code?}]`, `diff?{now, would}`, `unblocks[{id, title}]` and `links[{label, url}]`. One schema checks it: a call takes 2 to 4 options, a proposal also its diff, and an unblock item none, since it has Done, Later and Skip. Every text is kept exactly as given. The flag is `--item`, not `--json`, because `--json` is hq's output flag everywhere.
- An item added with `--item` keeps a plain body built from its details, diff and options, so `hq call show` and every reader of the body still work.
- `hq call|proposal stu <id> --view T` sets Stu's view. `hq call show` prints it and the options.
- `hq unblock later <id> [--until ISO|+4h]` hides an open item from the console until then (the next 07:00 Sydney by default). It stays open, so every list still shows it.
- The console's list of items (`loadConsoleItems`): open, queued and due calls and proposals in send order, then open unblock items that are not put off. An item filed as free text shows its body as one details section with no options.

## 0.39.2 — 2026-10-18

`hq fleet` and `hq fleet ensure` warn when the installed hq carries an older `fleet.json` than the checkout at `~/projects/hq` (z-stu). The JSON gives `staleBuild`. hq bundles `fleet.json` at build time, so a merged model change does nothing until `bun run install-bin`; that is how z-review kept spawning on its old model after hq#171.

## 0.39.1 — 2026-10-18

A release so the installed hq carries the merges since 0.39.0 (z-stu). `fleet.json` is bundled at build time, so `hq fleet` kept spawning z-review on its old model until a new build.

- z-review runs on sonnet (hq#171, the owner's call).
- z-steward's sync auto-merge skill change (hq#172), and the noslop reply and stewardship skill fixes (hq#169, hq#170).
- The shared `socket.yml` from zgeoff/tools (hq#150).

## 0.39.0 — 2026-10-18

A noslop review gets the Linear issue the PR links, for noslop's intent lens (z-stu, the owner's yes). noslop reads only GitHub `#N` issues, and our PRs link GEO-n.

- hq finds the GEO-n in the PR body: the first Fixes, else Contributes to, else Related to. It reads the issue's title and description with hq's existing read-only Linear key (the Linear key item in 1Password), so no new credential.
- It writes them to a file in the review folder (mode 600), passes `--issue-file <path>` to `noslop review`, and removes the file after the run.
- It passes the flag only when the pinned noslop's `review --help` lists it, asked once per pinned folder, so an older pin keeps working.
- No link, no flag, or a failed Linear read: the review runs without the issue and never fails for it. `hq review` prints the issue line (`== issue: GEO-n (attached)` or why not), and the review event carries it.

## 0.38.4 — 2026-10-18

hq records whether each noslop review ran with `--full` (z-stu). Schema v25 adds `noslop_rounds.full`: 1 for a full review, 0 for a review of the new commits only, NULL on a check and on reviews recorded before v25. `hq noslop report` counts the full reviews (`fullReviews`, and "n full" in the text). The usual hq.db backup is taken before the change.

## 0.38.3 — 2026-10-18

hq reads noslop review output version 5 as well as 4 (z-stu, before the noslop c978f9e pin). Version 5 only adds `dropped`, which hq does not read. Any other version is still `noslop_failed`.

## 0.38.2 — 2026-10-18

A lane's reported 0 Ready now stays fresh for 3 hours (`HQ_LANES_READY_ZERO_FRESH_MIN`, default 180), so the lanes nudge no longer names that lane as "Ready unknown" every half hour (z-delivery). A count above 0 still expires after 30 minutes. A new report replaces the 0 at once.

## 0.38.1 — 2026-10-18

`hq review <repo> <pr> --full` asks noslop for a full review of the PR, not only the commits since its last round (z-stu). It passes `--full` to `noslop review`, so the pinned noslop must have that flag. A PR on Codex refuses `--full` with `bad_args`.

## 0.38.0 — 2026-10-18

noslop reviews PRs in `hq review` for the repos on its list (z-stu). Off until someone runs `hq noslop on <repo>`: the list ships empty, and every other repo keeps the Codex review exactly as before.

- The list and the pinned commit live in hq.db meta `noslop` (`{repos, sha}`). `hq noslop` shows them; `hq noslop on|off <repo...>` edits the list (sorted, repeatable); `hq noslop pin <sha>` makes a folder for the commit beside hq's own clone of zgeoff/noslop (`~/.local/share/z-sessions/repos/zgeoff/noslop-<sha>`, a worktree that no later pin moves), runs `bun install --frozen-lockfile --ignore-scripts` in it and records the full sha. A review runs from its commit's folder, so a pin during a review never changes what runs. A listed repo with no pin refuses with `bad_config`.
- Which engine a PR gets: a listed repo's PR gets noslop, except one that already had a Codex round (a Codex review file, or a run PR with a review round), which finishes on Codex. A PR noslop has reviewed keeps noslop while its repo stays listed; an unlisted repo always gets Codex.
- The noslop review runs `noslop review --report sqlite,github --json` from a throwaway worktree of the base branch, with `bun --config=<clone>/bunfig.toml`, so the reviewed repo's own bunfig never loads. It has 15 minutes. hq then reads CI checks and open threads as the Codex path does.
- Credentials: the 1Password token is read from `~/projects/noslop/.claude/settings.local.json` (`HQ_NOSLOP_OP_SETTINGS` overrides the path), and `op read` fetches the app id, installation id and private key. They go into the noslop child's environment only, never into a log line, file or result. An error names the field, and an auth error says to re-mint with `op-mint noslop`.
- A timeout, a nonzero exit, output that is not JSON, an output version other than 4, or a failed noslop call is `noslop_failed`: no review, not a pass. hq never falls back to Codex.
- Schema v24: `noslop_rounds`, one row per review or check with its findings, conclusion, open findings, wall time, errors and the pinned sha. The usual hq.db backup is taken before the change.
- `hq review check <repo> <pr>` runs `noslop check` and prints the conclusion, the title and each open finding; it exits 0 for both conclusions, and `--json` carries `conclusion`.
- `hq review gate <repo> <pr>` is the merge gate for z-review: exit 0 to merge, or `merge_blocked` with the reason. A repo off the list, a bot PR and a PR that started on Codex pass. Any other PR needs a fresh check with `conclusion: success`; a failed check names each open finding, and a noslop error blocks. CI stays z-review's own step.
- Repo names ignore case everywhere (`ZGeoff/Tools` is the listed `tools`), and a Codex review file of a repo not owned by zgeoff now carries the owner (`<owner>-<repo><pr>-review.md`), so another owner's repo of the same name never counts as Codex history.
- `hq noslop report [--since ISO]` prints one block per PR: reviews run (ok and failed), extra rounds, distinct findings by severity, the latest check, how many findings were answered, wall time, and the time from the first review to the first passing check.

## 0.37.0 — 2026-10-17

Lanes: a run blocked on the owner frees its slot when its session sits idle, not only when it sleeps (z-stu). GEO-1042 and GEO-1130 held the cloud and flexible slots with sessions awake at "waiting for your input".

- A `blocked` run that waits on the owner no longer counts toward its lane once every session of its own is asleep, or awake and idle for 15 min. Idle is any atc state but `running`. The time runs from the first sweep that saw it idle, or from its last activity in atc when that is later, so a turn between sweeps restarts it.
- It counts again on a turn (`running`), when the owner answers, or on a state change. The imp memory guard is unchanged: launches still need free imp room.
- A session with no atc state counts as busy, as before. No schema change.

## 0.36.2 — 2026-10-17

`hq review` installs the repo's dependencies in its worktree before Codex runs (z-review). On atc#721 Codex could not resolve the workspace package `@atc/protocol/session`, so it reviewed statically and ran no tests.

- A worktree with `bun.lock` or `bun.lockb` gets `bun install --frozen-lockfile --ignore-scripts` before the Codex passes. Lifecycle scripts stay off, because the branch under review is not yet trusted. The install has 10 minutes.
- A failed or hung install doesn't stop the review. The output's `== install:` line and the review file's `## Install` section say it failed and that the review is static. `--json` gains `install: {ran, ok, detail}`.

## 0.36.1 — 2026-10-17

hq type-checks under `@tsconfig/strictest` (z-stu's lint request; the lint part comes in hq#139). No behaviour change.

- `exactOptionalPropertyTypes`: call sites that may pass `undefined` use `toExactOptional` from `@zgeoff/std` instead of a conditional spread. `UnblockInput.rank` keeps `undefined` as "keep the stored rank", and fields read from a zod parse accept `undefined`.
- `noPropertyAccessFromIndexSignature`: index-signature reads use brackets, such as `process.env['HOME']`.
- Unused imports removed.
- The lines these changes touched now pass the shared lint rules (hq#139's gate): braces, no `!` assertions, one declaration per scope, comments on their own line, `function` declarations, verb-first names. Renamed: `cacheDir`, `claudeJson`, `projectsDir`, `logFiles`, `usageCache`, `usageDir` and `folderTrust` gain a verb (`getCacheDir`, `checkFolderTrust` and so on).
- `hq lanes start` refuses with `bad_config` when HOME is unset; it used to write the unit under `undefined/`.
- `hq repair` builds a transcript folder name one `-` per UTF-16 code unit, as before; a regex flag briefly changed that on this branch, and a test now holds it.

## 0.36.0 — 2026-10-17

The capacity watch (z-stu, for the owner): every watcher tick hq reads what the fleet's machines have left, stores it, adds one line to the daily goals check-in, and tells z-stu and z-delivery when a threshold holds. Read-only: it changes nothing.

- Sources: impd (`impz info --json` for the RAM budget, used and committed; `impz ls --json` for the memory of the imps awake, split into `nixie-*` and the rest), the cloud host's memory (its node-exporter page over the tailnet, 5 s timeout), the newest Claude usage sample (no reading when older than 30 min), today's CI minutes (counted as the goals numbers count them, for the Sydney day), and this PC's disk and memory. Every read has a deadline; a source that fails or hangs stores NULLs and an `errors` entry, and shows `no reading`.
- Schema v23: `capacity_samples`, one row per tick, pruned past 30 days. The usual hq.db backup is taken before the change.
- Thresholds, set with `hq capacity set KEY VALUE` (`--reset` for the default; each change is logged): `nonnixMaxMib` 16384, `cloudMinAvailGiB` 4, `claudeSevenDayPct` 85, `claudeFiveHourPct` 90, `holdSamples` 2.
- Hold rule: a breach opens only after `holdSamples` samples in a row, and a clear needs as many good ones. A sample with no reading neither opens nor clears, and keeps the count.
- Recipients and quiet hours: one message per tick for what opened and one `back under` message for what cleared, each to z-stu and z-delivery. No notice is ever replaced or dropped: after an atc outage they arrive late but complete and in order, and the hold rule keeps them few. Each lists what is still open. In quiet hours everything is held except an impd open; at the first awake tick hq sends the alerts still open that were never told, and the clears of alerts that were. An alert that opened and cleared in quiet hours sends nothing.
- The daily check-in gains a `Capacity:` line before `Incidents today` (`Capacity: no recent reading` when the newest sample is over 15 min old). The check-in's 159-character line cap applies, so the end of a full line can be cut.
- Commands: `hq capacity` (newest sample, thresholds, open alerts), `hq capacity sample`, `hq capacity log [--hours 24]`, `hq capacity set`. The watcher runs the step after the goals sync and logs `capacity: N opened, M cleared`; a failure logs `capacity failed: ...` and never fails the tick.
- Kysely, first stage (Decision 23): `kysely` 0.29.6 behind `src/kdb.ts`, a typed query builder over hq's own bun:sqlite database. The capacity samples use it; migrations stay raw SQL. `readImpd` is exported for Decision 16's lanes to reuse later; lanes are unchanged.
- The PC is shown, never alerted on: `hq health` already alerts z-stu on its disk and memory.

## 0.35.0 — 2026-10-17

The refusal log (z-stu, for the owner): hq records every auto-mode refusal in the fleet's local Claude Code transcripts, so nobody has to remember to. A refusal is a record whose `toolDenialKind` is `automode-blocked`; hq reads that field and never matches text.

- Schema v22: `refusals` (one row per refusal, deduped by the record uuid: when, Claude session, atc session and name, issue, transcript, subagent or not, cwd, tool, input, reason) and `refusal_files` (a byte offset per transcript, and its recent tool_use ids with the tool name and masked input only). The usual hq.db backup is taken before the change.
- `hq refusals [--days 7] [--by reason|session|tool]` lists them newest first or tallies them. `hq refusals scan [--since 14d] [--budget-mb N]` scans now; `--since` widens the backfill for files not yet seen.
- The watcher scans every tick under its step deadline and logs `found N refusals`; a failed scan never fails the tick. The weekly goals message gains `Refusals: N (top reasons: ...)`.
- Bounded: each transcript streams line by line from its offset, and a partial last line waits. A file first seen older than 14 days skips its history. A scan stops after 256 MiB, newest files first, overspending by one read and one line at most; the rest resume next scan. A line over 16 MiB is passed over (a refusal is a few KB). On the live projects dir a scan took about 5.5 s, and a full 14-day backfill found the same 275 refusals a grep did.
- A refusal's tool comes from the tool_use ids seen before it in the same transcript, kept across scans (the last 128 per file), so parallel calls and a large result in between don't lose it.
- Redacted: the input is only a Bash command or a file path, capped at 120 characters, and the reason at 300. Token shapes (GitHub, `sk-`, Bearer, `ops_`, AWS, JWT, `KEY=`/`TOKEN=`/`SECRET=`/`PASSWORD=` values, runs of 32+ base64 or hex characters) become `[redacted]` before the cap. `serverClassifierContext` is never read.
- Local transcripts only; imp-hosted ones are a follow-up. Atc down: the rows keep no session name.

## 0.34.7 — 2026-10-17

`hq unblock add` warns when a done or dropped item already unblocked the same GEO issue (z-stu). A reworded waiting-on-the owner line used to come back as a new item with no hint.

- A new or reopened item lists each closed item that names one of its issues: `warning: GEO-2 was already on the list as kettle (done 2026-10-17): Try the kettle`. The match ignores case.
- The item is still added. `--json` gains `warnings: [{issue, id, state, closed_at, task}]`, empty when nothing matches.
- A refresh of an open item, a no-op, and an open item for the same issue give no warning. No schema change.

## 0.34.6 — 2026-10-17

The deploy-prod success rate counts applies only (z-stu). It was ok / (ok + failed + cancelled) over every cloud deploy-prod run. A hold failed the `apply` job on its step `Hold for a manual dispatch`, so a held plan counted a failure per later commit; and a run where `decide` found nothing to apply (`apply` skipped) counted a success.

- Schema v21: `deploy_runs` keeps one outcome per completed run: `applied_ok`, `applied_failed`, `held`, `no_apply`, `cancelled` or `unknown`, read from the run's jobs.
- The goals sync (watcher and `hq goals sync`) classifies up to 60 unclassified runs per call, oldest first, so a backfill spreads over several syncs. A jobs answer hq can't read leaves no row and is an error; the run is tried again next sync.
- The rate is applied_ok / (applied_ok + applied_failed + cancelled). Its text reads `90% (9/10 applies), 11 held, 6 no-apply`, with `, N not yet classified` while runs wait for the sync. The goals table and legend show applies, holds and no-apply apart.
- An apply job that succeeds with its `Apply` step skipped counts as no-apply. A re-run is classified again: `deploy_runs` keeps the attempt it was read from.
- A run left unclassified gives the rate no colour, the watcher and `hq goals sync` leave the check-in's freshness mark alone, and the daily and weekly reports show holds, no-apply and unclassified counts.
- `GoalRow.deploys` keeps its old fields and gains `applied_ok`, `applied_failed`, `applied_cancelled`, `held`, `no_apply` and `unclassified`.

## 0.34.5 — 2026-10-17

The first live run of the prompt-drift check read every role prompt as unknown, and its one stale hint showed no difference.

- The quick fetch of main for the check waits up to 10 s, not 2 s. A fetch took 2.5 s live. A timed-out fetch now says so, where it used to say `failed (null)`.
- The hint names the line and starts each side a little before the first character that differs, so a long shared start no longer hides the change.

## 0.34.4 — 2026-10-17

`hq fleet` flags a session whose atc prompt differs from the one hq would spawn it with on main (z-steward). atc revives a session with the prompt it was first spawned with, so a prompt change on main never reached a running session: z-triage's still said to update the hq checkout to origin/main.

- Each declared entry with a live atc session gains `promptCheck: {state, since, hint, reason}` in `hq fleet --json`. `state` is `current`, `stale` or `unknown`. A stale one has `since` (the latest main commit that touched the prompt, or the file's mtime) and `hint` (the first differing line). An unknown one has a `reason`: atc gave no prompt, `session.get` failed, or main could not be read. Unknown is never stale. Trailing whitespace is ignored. `prompt` keeps its meaning, the source string.
- The text output adds `<name>: prompt stale since <sha> <subject> — replace it as docs/sessions.md describes`, the hint under it, and `<name>: prompt check unknown (<reason>)`.
- Read-only: it restarts and messages nothing. With atc down, status prints as before and checks nothing. `hq fleet ensure` is unchanged. No schema change, no new dependency.
- `hq fleet --json` checks prompts only with `--prompts`: z-steward's compaction hook reads `hq fleet --json` under a 5 s limit. The text form always checks. The check runs the session.get calls together within 3 s, and a reply still out at the deadline reads unknown.
- `hq fleet ensure` keeps its normal origin/main fetch, with its retry.

## 0.34.3 — 2026-10-17

A busy day of CI runs no longer blocks the goals check-in. nixie ran 1,277 workflow runs on 16 Oct, and the API lists at most 1000 per query, so hq refused the day. The goals pass then never ran without errors, and the check-in waited forever.

- `syncRunsDay` fetches a day with more than 1000 runs in halves, then smaller windows, down to one hour. Only an hour with 1000 or more runs refuses the day.
- `hq goals daily` and `hq goals weekly` say "goals data has no sync without errors yet", not "never min old".

## 0.34.2 — 2026-10-17

Every gh call hq made had failed with 401 since 16 Oct (z-stu). The goals check-in never sent, and hq health said only "no run today". The cause: hq-lanes runs in ~, the compiled hq loaded ~/.env (Bun does by default), and that file is shell. Its GITHUB_TOKEN line reached hq as the unrun `$(...)` text, and gh prefers GITHUB_TOKEN over its own login.

- scripts/install.sh builds with `--no-compile-autoload-dotenv --no-compile-autoload-bunfig`, so hq reads no .env or bunfig.toml from its working directory.
- `cleanEnv()` drops a GITHUB_TOKEN or GH_TOKEN that is not shaped like a GitHub token, so gh falls back to hosts.yml.
- The watcher notes a GitHub 401 and clears the note on the next sync that works. The goals check-in and weekly health lines then give the cause: "GitHub auth failed (401) for hq's gh calls since <time>".

## 0.34.1 — 2026-10-17

A typed `config()` with zod (GEO-1053, J49). `src/config.ts` holds one schema for every `HQ_*` setting and `REVIEW_DIR`, and every read in `src/` goes through `config()`. A bad value now fails with its name: `HQ_RUN_QUIET_MIN must be a whole number, 0 or more, got 'abc'` (`bad_config`) instead of a `NaN` deep inside a command. `run()` checks the settings once before it dispatches; `help`, `version` and `capabilities` skip the check so a session can still read help. The three waits that always fell back to their default on a bad value (`HQ_RC_POLL_MS`, `HQ_SEND_WAIT_MS`, `HQ_RESTORE_WAIT_MS`) still do.

- Meta values that hold JSON are read with `metaJson(db, key, schema, fallback)`: a missing key gives the fallback and a malformed value is `bad_meta` naming the key. The readers that always tolerated bad JSON (account labels, goal targets, fleet ids, the defs tree record) keep doing so.
- atc's answers are checked at the boundary. A reply that lacks a field hq needs is `bad_atc_answer` naming the method and the field. Objects are loose, so extra fields pass and optional ones stay optional.
- New dependency: `zod` 4.6.7, pinned. No schema change.

## 0.34.0 — 2026-10-17

`hq capabilities [--json] [--require X.Y.Z]` (GEO-1053, J42). It prints the hq version and schema, every command in the registry (nouns, verbs, usage, summary, section, read-only), the ask, run and run PR transition tables, the roles, and the top-level keys of the JSON other sessions parse today: `fleet`, `status`, `run list`, `run show`, `call list`, `proposal list` and `review`. Text mode is a short summary. It never opens the db.

- `--require X.Y.Z` is the check a session runs at start. If this hq is older, it exits non-zero with `too_old` and says to run `bun run install-bin` in `~/projects/hq`. A version that is not `X.Y.Z` is `bad_args`.
- `package.json` carried 0.1.0; it now carries the real version, and a test fails if it differs from `VERSION`.
- A test per shape runs the real command and checks each listed key is in its output, so the list cannot drift.

## 0.33.9 — 2026-10-17

`hq review` picks Codex's effort by risk and runs the allow-or-deny pass only when it is needed. The owner decided both on 17 Oct, via z-stu. Both are interim: the code-review pipeline's review tool replaces `hq review`.

- Effort is high when a changed path, or a changed line of the diff, hits the owner's must-fix list: auth, secrets or credentials, money, migrations, deletion, or infra permissions. Otherwise it is medium. The output prints `== effort: <tier> (<reason>)`, and the review file gets an Effort section. `--effort high|medium` overrides the tier and says which tier risk chose. If the diff cannot be read, effort is high.
- The allow-or-deny pass runs only when the diff adds or changes a permission, rule or grant table, an allowlist or denylist, or a policy function. Otherwise hq prints `allow-or-deny pass skipped: <reason>`. If the diff cannot be read, the pass runs.

## 0.33.8 — 2026-10-17

One command registry (GEO-1053, J40). `src/commands.ts` has one row per command: its nouns and verbs, usage, summary, help section, whether it only reads, and its handler. `run()` looks a command up in the table, and `hq help` is rendered from the rows, byte for byte the text it printed before. No command changes: same arguments, output, errors and exit codes. Tests check the help text against a saved copy, that every row resolves to itself, that no two rows claim a verb, and that every verb the group functions handle has a row. The table is exported, so `hq capabilities --json` can print it later.

## 0.33.7 — 2026-10-17

One transition table for asks, runs and run PRs (GEO-1053, J39). `src/transitions.ts` lists, per action, the states a move may start from and where it goes; every write to an ask, run or run PR state checks it first, and a move the table does not list errors with `bad_state`. No move the sessions make today changes. Tests compare every state and action pair with the table. The tables are exported, so `hq capabilities --json` can print them later.

## 0.33.6 — 2026-10-17

A Codex review of hq#108, run after it merged, found one loop. `hq outbox forward <name> --remove` on a stored override brings back the forward fleet.json declares for that name, and that forward could close a loop with the stored ones. The removal now refuses then, and names the loop.

## 0.33.5 — 2026-10-17

`hq review` fixes from z-review's first day (z-steward, z-stu, the owner).

- Same-repo reviews can run in parallel: a lock per repo, a folder in the review folder, covers the git steps that change the shared checkout (the fetch, the worktree prune and add, the worktree remove). Parallel fetches had raced on `refs/remotes/origin/main`. A lock older than 10 minutes, left by a dead review, is taken over.
- Codex's review pass can write Bun's shared install cache (`-c sandbox_workspace_write.writable_roots=[<cache>]`), so installs in its sandbox no longer fail with EROFS. The cache is `BUN_INSTALL_CACHE_DIR`, else `~/.bun/install/cache`. The allow-or-deny pass stays read-only.
- Both passes run at `REVIEW_EFFORT`, medium for now (decision D-review-effort), not the effort in ~/.codex/config.toml.
- When Codex prints its own usage-limit or "Review was interrupted." line (at the start of a line, so a quoted diff does not count) instead of a review, `hq review` fails with "this is no review, not a pass" and skips the allow-or-deny pass. It no longer exits 0 with an empty review.

## 0.33.4 — 2026-10-17

`hq run merged` asks GitHub first, and `hq run unmerge` undoes a wrong merged mark (z-steward, from z-review). A `gh pr merge` that failed on a conflict once left atc#706 open on GitHub but merged in hq, and nothing could undo it.

- `hq run merged <pr>` runs `gh pr view --json state,mergedAt` and refuses unless GitHub says MERGED, naming the state it found. When gh fails, it refuses too.
- `hq run unmerge <pr> [--reason T]` puts a PR marked merged back to open and logs an `unmerged` event. The final and review marks stay.

## 0.33.3 — 2026-10-17

The fleet's roles live in one table, `fleet.json` at the repo root, and no session name is written anywhere else in src/ (GEO-1053, hq decision 21). `hq fleet --json` now says which skill and roles each session has.

- `src/roles.ts` loads and checks `fleet.json` at start: names are `z-` plus letters and unique, each of owner, orchestrator, reviewer and qa has exactly one holder, and a forward points at a declared name. A bad file stops hq with a `bad_fleet` error naming the field.
- Owner, morning-report target, live-check and done recipients, the reviewer, the orchestrator and the declared fleet all read the table. `HQ_OWNER`, `HQ_LIVECHECK_TO` and `HQ_ORCHESTRATOR` still override.
- The retired name z-refine forwards to z-triage from the table. A row in `outbox_forwards` for the same name still wins.
- `hq fleet --json` gives each declared entry `skill` and `roles`, and the top level `roles` (each role to its session, or a list) and `forwards`.

## 0.33.2 — 2026-10-17

hq messages a fleet session by the id `hq fleet` recorded, then by its name (z-stu). A `/rename` in Claude Code wins over atc's name, so z-stu showed as "stu" and every send to `z-stu` failed with "no live session named z-stu".

- The outbox and `hq wake` look up a declared name in `fleet_ids` first. When that session is alive, it gets the message under any name. Otherwise hq falls back to the live session with that name, as before.

## 0.33.1 — 2026-10-17

z-review joins the fleet, and hq hands it final PRs (z-steward, from the owner's grant; skill in hq#100).

- `hq fleet` declares z-review like z-qa: the hq-defs checkout, opus, the pr-review skill's start prompt, woken by the fleet timer.
- When hq marks a PR final with a new sha (a FINAL note, a final phrase, or `hq run final`), it messages z-review: `Final: GEO-n (repo#n at <sha7>). Review it, then merge.` A new sha for the same PR means its head moved, and gets the same message on the same topic (`final:<ref>`), so an unsent older one is replaced. The same sha again sends nothing.
- `hq run unfinal`, `hq run merged` and `hq run closed` drop an unsent final notice for that PR, so z-review never gets a stale one after an atc outage.
- Live-check messages for shipped runs go to z-qa alone (`HQ_LIVECHECK_TO` still overrides), since hq#100 made post-release live checks z-qa's. Runs closed with no check owed still go to z-delivery.

## 0.33.0 — 2026-10-17

hq moves a run on once a shipped release contains its merge (z-stu and the owner, 17 Oct). 52 runs had sat in deploying or deploy-held after their releases had gone out. Schema v20.

- `runs.live_check` (owed, none, or unset which counts as owed) is set by `hq run state <issue> <state> --check owed|none` or `hq run check <issue> owed|none`, logged and shown in `hq run show`. `run_prs` keeps `merge_sha`, `shipped_tag` and `shipped_at`.
- src/releases.ts holds a fixed table of release sources: published nixie and impz releases tagged `v<digit>`, auto-mode `auto-mode-v<digit>`, atc `@zgeoff/atc@<digit>`, and cloud's moving `deployed/prod` tag. Every other repo has none, and hq never moves its runs.
- The watcher runs `shipRuns` every 10 minutes, and `hq run ship [--dry-run]` runs one pass. A run in merged, deploying or deploy-held with no open PR and at least one merged PR, every merged PR of which is in a release (found by `compare`, the oldest containing release kept, at most 60 compares a pass), moves to live-check, or to done when no check is owed, with a `shipped` event. A bad releases payload skips that repo and records an error; it never moves a run.
- One message per pass: live-check runs to z-qa and z-delivery (HQ_LIVECHECK_TO, a comma list, changes that), done runs to z-delivery. Each pass has its own outbox topic, so an unsent list is never replaced by a later one.
- `hq stats` no longer calls a lane's fresh Ready of 0 stale: a sample's eligible count is the fresh per-lane Ready over lanes with free slots, unknown only when none of them has a fresh report. The warning now says "no fresh per-lane Ready report".
- `hq lanes ready --lane ... [--ready-total N] [--skipped "GEO-1=reason;GEO-2=reason"]` records every Ready issue z-delivery saw and why some were skipped. `hq lanes` and the daily check-in show `Ready: N total, E eligible across lanes, S skipped with reasons, U unexplained`, flagged UNEXPLAINED when U is above 0.

## 0.32.3 — 2026-10-17

hq's repo scope is now a list of the repos in scope, not a list of those out (the owner, via z-steward and hq#98). `IN_SCOPE` in src/scope.ts holds the 12 repos under "In:" in repo-facts.md's "repos in scope" section, and a test keeps the two equal. The goals CI sync and the closed and merged PR syncs keep only those repos, so a new zgeoff repo stays out until the owner adds it there.

Rows stored for a repo before it went out stay in the database, since the owner may move a repo back in. No count reads them: the goals rows, CI coverage, the merged-PR kinds and Linear shares, and the Linear fetch all filter on the in-scope list. So a repo's old CI keys never make later days look unfetched.

## 0.32.2 — 2026-10-17

hq skips `zgeoff/decree` (z-steward, from the owner: decree is out of scope).

- `OUT_OF_SCOPE` in src/scope.ts lists the repos out of scope. A test keeps it equal to the "repos in scope" section of docs/skill-development/repo-facts.md.
- The goals CI sync no longer lists those repos. The closed-unmerged and merged PR syncs search every zgeoff repo and drop rows from those repos before they store anything.

## 0.32.1 — 2026-10-17

`hq run unfinal <pr> [--reason T]` clears a final mark the PR's head has moved past (z-delivery). Until now the sweep flagged "final at <sha>, no review" every 30 minutes, with no way to stop it short of a new final.

- It clears the PR's final sha, time and source, and logs an `unfinal` event with the old sha, its source and the reason. The sweep then stays quiet on that PR until the next `hq run final` or final marker.
- It refuses a PR with no final mark, and a PR that is merged or closed.

## 0.32.0 — 2026-10-17

`hq repair advisor-400` mends a stopped Claude session that fails every turn with "unexpected tool_use_id found in advisor_tool_result blocks" (z-stu, for the owner; root cause GEO-1169).

- The fault: a record written mid-turn, such as an atc-bridge message, lands in the parentUuid chain between an advisor `server_tool_use` and its `advisor_tool_result`. Claude then sends the result in a later message than its use, and the API refuses every turn.
- The repair re-links the result to its use. It moves the record in between (or several, in their order) after the turn's last record, which is the last tool_result for the turn's tool uses, so the message stays in context. The record after the turn then follows the moved one. Only `parentUuid` fields change; every other line stays byte for byte, and a changed line that would not round-trip through JSON is refused.
- `hq repair advisor-400 <session>` asks atc for the session. It refuses unless the session has exited, runs claude and is on this machine, then reads `~/.claude/projects/<cwd>/<Claude session id>.jsonl`. `--file T.jsonl` names a transcript instead; then no live atc session may hold it. With atc unreachable, hq refuses.
- A dry run by default: it prints each split and each parentUuid change. `--apply` copies the transcript to `~/.local/share/z-sessions/backups/transcripts/` first, writes through a temp file and a rename, and refuses if the file changed while hq read it.
- Checks before and after writing: every line parses, the chain has no loop and no split on the live branch, and the last `last-prompt` leaf sits on that branch. A split off the live branch is reported and left alone.

## 0.31.1 — 2026-10-17

`hq review` keeps Codex out of the PC's /tmp (z-stu). /tmp is a 16 GiB tmpfs, so files there use RAM; a review's Codex run once filled it with Bun caches it chose to make.

- Both Codex passes run with `TMPDIR` set to the review's own folder (`<review dir>/<repo><pr>-tmp`). hq removes that folder when the review ends, pass or fail.
- Both passes get this as developer instructions (`-c developer_instructions=…`, since `codex review --base` takes no prompt): "Use Bun's shared install cache; never set BUN_INSTALL_CACHE_DIR or BUN_TMPDIR, and make no folder in /tmp." An override replaces the config value, so hq reads `developer_instructions` from `${CODEX_HOME:-~/.codex}/config.toml` at run time and passes that text with the sentence added. With no value there, or a config that won't parse, it passes the sentence alone.
- The review folder (worktree, review file) defaults to `~/.local/share/z-sessions/reviews`, on disk, not `${TMPDIR:-/tmp}/frankie-reviews`. `REVIEW_DIR` still overrides it.

## 0.31.0 — 2026-10-16

The Nix probe also checks `/health/ready` (GEO-1142, hq part). Nix can stay live while it is unready; until now nobody heard.

- While `/health/live` answers, each probe also fetches Nix's /health/ready (`HQ_PROBE_READY` overrides it). Ok means HTTP 200, as for live. When live fails, ready is not fetched and the down logic runs as before.
- Schema v19: `probe_samples.ready_ok` (NULL when not checked, and for samples from before v19) and `outages.kind` (`down` or `unready`). One outage of each kind may be open at a time. Every earlier row is `down`.
- An `unready` outage opens when ready has failed on every live-fine sample for 3 minutes. It is dated from the first failing sample. z-stu and z-delivery hear at once, with no quiet-hours hold: `Nix is unready: <url> failing since HH:MM (<n> checks; /health/live is fine). ...`. The first ready sample closes it with `Nix is ready again: unready <m> min (HH:MM–HH:MM Sydney).`
- A live failure while an unready outage is open does not close it. A sample from before v19 ends an unready run. Down and blind samples are skipped by it.
- Every existing reader of outages still means down: `openOutage`, `downtime()`, `outagesIn()` and the goals measures. Unready time is not downtime. New: `openUnready()` and `unreadyIn()`.
- `hq probe status` shows the last ready check, any open unready episode, and the unready episodes in the window. The daily check-in lists them beside outages as `Nix unready HH:MM–HH:MM (m min)`. `hq health` is unchanged.
- Unready messages use their own topic, `nix-unready`, so they never replace an unsent down or back message (`nix-outage`).

## 0.30.2 — 2026-10-16

Goals: a week with days hq has not fetched gets no colour (review follow-up from hq#68).

- A goal measure counts the past UTC days in its window whose data hq has not fetched: CI runs for deploy-prod success and CI minutes wasted, merged PRs for the Bug and Feature + Improvement shares. Today never counts, since it is still open.
- A measure with such days shows "N day(s) not fetched" in the daily and the weekly, and gets no colour, never green or red.
- The watcher now looks back 15 days for CI runs, closed PRs and merged PRs, not 1. After a watcher gap, the missed days are fetched again and the weekly's two weeks fill. Days already fetched are skipped. One watcher pass fetches at most 80 repo-days of CI, newest first, so its step stays inside its 120 s; the rest come on later passes.
- Tests: `fetchedDays()` in test/helpers.ts marks the fixture days fetched, in one transaction.

## 0.30.1 — 2026-10-16

Remote Control after a spawn, v2 (GEO-1102). hq now asks Claude Code whether Remote Control is on, and types only when it is sure it is off.

- A spawn of z-stu starts a helper unit right away (`hq fleet rc z-stu`). It looks every 15 s (`HQ_RC_POLL_MS`) for up to 30 min. Once the session is done and 2 min old, it types `/remote-control z-stu` one time if Remote Control is off. The 5-minute `hq fleet ensure` runs the same steps as a fallback, and one database transaction lets only one of them type.
- The signal is `replBridgePlaceholders` in Claude Code's config file, matched to the process of that session (found by its `--add-dir .../atc/sessions/<id>` argument). hq only reads that file: it never writes, renames or locks it.
- On: a record for the session's process, written since the last boot, with the same process start time (`procStart`), so a reused process id doesn't count. Both on and off need the process alive with a readable start time.
- Off (z-stu's option A): no record for the process, the list holds fewer than 20 records (Claude Code keeps the newest 20), and another process wrote a record in the last day, which proves records are being written. Claude Code writes them only while a feature flag allows it, so this is strong evidence, not proof.
- Anything else is unknown, and unknown means no typing: a missing or unreadable file, an unexpected shape, no single matching process, a full list, or no recent record. hq tells z-stu to type `/remote-control` by hand. Remote Control already on also means nothing typed.
- If hq types and no record shows within 30 s, z-stu gets "Remote Control may be off in z-stu: typed, no record" at once, even in quiet hours, since the typing may have turned it off.
- The helper opens a new atc connection after an atc restart. A call that failed is never retried, since a timed-out submit may have typed.
- The report is honest about what happened: typed and on, already on, can't tell, typed but not on within 30 s, or "did not type (already marked as typed)". The old screen check is gone, because it could not see Remote Control on z-stu's screen.

## 0.30.0 — 2026-10-16

The Monday 17:00 weekly goals review, and Claude usage per account (the goals rhythm, part 3 of 3).

- At 17:00 Sydney on Mondays the watcher tells z-stu where each goal stood over the last complete week and the week before. It is a table: goal, target, this week, last week, and a colour. Each value names its n. The downtime row gives outages, the slowest detection and blind minutes. The message ends with the flags you kept (news tagged `weekly-flag` since the last weekly, or the last 7 days the first time) and where the targets live. The first run is Mon 19 Oct 2026.
- It waits for the next tick when the goals data is over 35 min old, and quiet hours never hold it. `hq goals weekly` prints the message and sends it now; `--dry-run` sends nothing and writes no job row. `hq goals weekly skip [DATE] --reason T` leaves a Monday alone. `hq health` goes red when a Monday has no run after 17:30.
- The watcher now reads every `z-capacity/claude-usage/<account>.json` and stores one `usage_samples` row per account whose file is newer than that account's last row. The account is an opaque key; a file whose account is not 12 hex characters, or is not its file name, is skipped. With no folder it reads the old single file as before.
- `hq goals account KEY NAME` names an account (a slug, 24 characters at most; `none` clears it). The weekly shows the name, else the first 6 characters of the key. The cost row lists each account's peak 7-day use and latest readings, plus CI minutes, with no colour while cost has no target. A week with no per-account rows says "active account only".
- Downtime is now judged on exact durations. A detection of 5 min 1 s is red, 14 min 59 s down is green, and 15 min 0 s is red. Only the figures shown are rounded.

## 0.29.1 — 2026-10-16

hq is the only definitions source (z-steward, step 5 of the fleet move). nixie-definitions#161 trims that repo to nixie.yaml and persona.md, so it has no skills or start prompts left.

- A missing switch file (`~/.local/share/z-sessions/defs-source`) now means hq. Before, it meant nixie-definitions, so after the trim a lost file would have respawned every session from a checkout with no skills.
- A switch file that still says nixie-definitions is read as hq. `hq health` shows it in red until `hq defs use hq` rewrites the file.
- `hq defs use nixie-definitions` and `hq defs setup nixie-definitions` refuse with one line: the source is retired.
- The hourly fetch check in `hq health` checks hq's main, since hq is the source.

## 0.29.0 — 2026-10-16

Goal targets, the 7 measures, and a daily 18:00 check-in (the goals rhythm, part 2 of 3).

- Targets live in config. The defaults are in code: bugs under 20% (by 2 Nov), features 60% or more, deploys 90% or more, downtime under 15 min a week with each outage caught within 5 min, CI waste 10% or less, must-fix 20% or less, and no cost target yet. `hq goals target <goal> <op> <value>` moves one, `hq goals target <goal> none` clears one, and `hq goals targets` lists them and says which are defaults. Every change is logged.
- Seven measures per window, each with its denominator: bug share and feature share of merged PRs with a typed Linear issue, deploy-prod success over completed runs, Nix downtime minutes, CI minutes in failed or cancelled runs, first reviews that found a must-fix, and cost. A goal with no data shows "no data" and is never green. Cost is a baseline only: no colour while it has no target.
- The watcher samples the Claude usage cache once per new reading (`usage_samples`). Cost reports the last reading and the window's 7-day peak, for the active account only.
- At 18:00 Sydney the watcher tells z-stu where each goal stands, today and for the week so far. The colour and the target are for the week so far. It waits for the next tick when the goals data is over 35 min old. Quiet hours never hold it, because 18:00 is never quiet.
- `hq goals daily` prints the message and sends it now. `--dry-run` sends nothing and writes no job row. `hq goals daily skip [DATE] --reason T` leaves a day alone. `hq health` goes red when a day has no run after 18:30.
- `hq news add --tag SLUG` tags an item (a lowercase slug, 32 characters at most). `hq news` shows the tag. `newsTagged()` reads the items with a tag added since a time, for the weekly review.
- Schema v18 adds `news.tag` and `usage_samples`.

## 0.28.0 — 2026-10-16

The Nix uptime probe, the first part of goal 4: Nix unplanned downtime under 15 min a week, each outage caught within 5 min.

- `hq probe run` checks Nix's /health/live once. Only HTTP 200 counts as up. A failure is then checked against a control URL (https://api.github.com/zen).
- A failed target with a working control is `down`. When both fail, the sample is `blind`: the PC's network, DNS or sleep, not a Nix outage. Blind samples neither count toward an outage nor reset the count.
- Two `down` samples in a row open an outage, dated from the first one. The first `up` sample closes it.
- hq tells z-stu and z-delivery when an outage opens and when it closes (GEO-1104): z-stu decides whether to wake the owner, and z-delivery starts the fix. These messages skip quiet hours and go out at once, through the command's own send, not at the watcher's next tick.
- `hq probe [status] [--days 7]` shows the timer, the last sample, any open outage, minutes down, outages, the slowest detection and blind minutes. `hq probe timer install | remove` runs the check every minute.
- `hq health` goes red while an outage is open, and when the last sample is more than 5 min old. With no samples at all it says so and stays green.
- Schema v17 adds `probe_samples` (kept 60 days) and `outages`.

## 0.27.0 — 2026-10-16

Lanes: a run parked on the owner frees its slot (z-steward, from z-delivery's feedback).

- A run that is `blocked`, has `waits_on_geoff` set, and has no active session awake in atc no longer counts toward its lane. Today such runs filled the atc, imp and cloud lanes while the owner was away, and those lanes launched nothing.
- It counts again as soon as its session wakes, the owner answers, or its state changes. The lane may then run over its size for a while.
- The sweep records which sessions atc shows awake: alive, with its vm not asleep and its harness not suspended. With no reading under 15 min old, or one from the future, every run counts as before, because a wrong free slot could overfill the imp.
- `hq lanes` lists the parked runs on their own line.

## 0.26.1 — 2026-10-16

No test, and no run on a scratch database, reaches the live atc. A run of the probe branch's code sent z-stu three invented "Nix is down/back" alerts.

- Under `bun test`, hq connects only to an atc socket that the test names with `HQ_ATC_SOCKET`. With none named, it uses a path that does not exist, so even a read fails.
- A write to atc (`session.message`, `session.submit`, `session.input`, `session.spawn`) is refused before it goes out (`atc_write_refused`), unless hq runs on the live database or a socket is named. This covers a review, or a check run from source on a scratch database, which `HQ_NOTIFY=off` alone did not.
- Tests prove both: a write to an unnamed socket never reaches the daemon, and a flush with sending on and no fake atc fails and keeps the message.

## 0.26.0 — 2026-10-16

GEO-1102: Remote Control on for z-stu after each spawn, with no one typing the command.

- Claude Code 2.1.301 has no per-session setting that hq can reach. `--remote-control` is a launch flag, which atc's spawn does not pass. `remoteControlAtStartup` works only in user or managed settings, so it covers every session. hq therefore types the command.
- A fleet entry takes `remoteControl: true`. Only z-stu has it. When `hq fleet ensure` spawns such an entry, it writes a marker in meta (`fleet_rc_pending`).
- A later ensure run types `/remote-control <name>` once, through atc's `session.submit`. It types only when the spawn is 2 min or more old and atc shows the session as `done` (its start turn has ended). atc's mid-turn and permission-prompt refusals leave the marker for the next run.
- hq types once only, because a second `/remote-control` turns Remote Control off. The marker records the time before the line goes out, so a crash after the typing never types again.
- After the typing, hq reads the session screen and reports one of these: on, failed, a confirmation dialog, or no line it can read. The result goes in the fleet message to z-stu and in an `events` row (`fleet`, `remote-control`). A session that is gone, or one whose start turn does not end in 30 min, is reported, with nothing typed.

## 0.25.1 — 2026-10-16

GEO-1018, with GEO-1017 and GEO-1019 folded in (the 2026-10-15 architecture review). This redoes hq#50, which reformatted every TypeScript file by mistake; hq#50 is reverted here.

- hq stops when atc changes protocol. A daemon that refuses hq's v4 hello gives `atc_protocol_mismatch` naming both versions, and so does any reply whose frame `v` is not 4: hq does not read it. Session-name lookups no longer hide this error behind their fallback.
- `test/fixtures/atc.json` holds a hello and an event cursor from a running atc (4.10.0), recorded by `bun scripts/atc-fixture.ts`. A test decodes that cursor and checks hq's own start cursor has the same form.
- Every final sha leaves an `events` row (`run`, `final`) with the ref, the sha, the old sha, what set it, and the `run_notes` id when a note did. Before, only `hq run final` logged one.
- The definitions checkout path is written once: `HQ_DEFINITIONS_DIR` names it, else the switch file picks a source under one workspaces root. A test moves it for the fleet, the lanes' capacity script and the prompts together.

## 0.25.0 — 2026-10-16

For z-stu (the owner's team goals: fewer wasted deploys and builds, fewer bug PRs).

- `hq goals [--days 14]` shows the team-goals numbers per Sydney week (last 2) and per Sydney day: cloud's deploy-prod runs by conclusion, z-delivery's DEPLOY and HOLD lines, CI runs, failed, cancelled and re-run counts, CI minutes and the minutes in failed or cancelled runs, and PRs merged and closed unmerged. `hq goals sync` backfills. `hq stats` shows the weekly rows.
- The watcher fetches yesterday and today every 30 min, 4 repo-days at a time. A past UTC day is stored once, after every run in it has finished.
- Schema v16 adds `ci_runs`, `closed_prs` and `goal_days`.
- CI minutes are wall clock from a run's start to its last update, not GitHub's billable minutes.
- `hq health` also checks free space on /tmp. /tmp filled up on 2026-10-16 with leftover Bun caches.

## 0.24.2 — 2026-10-16

For z-stu.

- The hq-defs sync handles other gits in the same checkout. A fetch that fails because another git holds a ref lock ("cannot lock ref", "unable to update local ref", or a busy `.lock`) is retried once after 3 s. If it still fails, the tick is left as a pass and the next tick tries again. The defs-tree check goes red only when two ticks in a row hit the lock. Any other fetch failure is red at once, as before.
- hq's own git calls in the sync run under an flock on `.git/hq-sync.lock`, so the watcher and a hand-run `hq defs sync` never race each other. A session's own `git fetch` does not take this lock, so the retry covers that case.

## 0.24.1 — 2026-10-16

For z-stu.

- `hq fleet ensure --now NAME,...` spawns the named declared sessions without the waits: the grace, the unlisted grace, "atc still means to run it", and the recent-restart hold. It is for a deliberate re-home. The live checks still apply: a live session under the name, or under its known id with any name, means no spawn. A name outside the declared fleet is refused, and nothing spawns.
- Only one `hq fleet ensure` runs at a time. A run takes a lease in hq.db, and a crashed run's lease expires after 5 min. An overlapping run spawns nothing: the timer's run reports a skip, and a `--now` run says "another hq fleet ensure is running; try again in a minute". A spawn also saves the time the session went missing before it calls atc, so a retry reuses the same spawn key.

## 0.24.0 — 2026-10-16

GEO-1021, with GEO-1015 folded in.

- The hq-lanes watcher loop moves from cli.ts to `src/watcher.ts`, and `send` to `src/send.ts`. cli.ts keeps parsing and rendering, and still exports `send`. The tick runs the same steps in the same order.
- A hung call no longer stalls the watcher:
  - Every command the loop runs has a 60 s deadline (`boundedRunner`). `realRunner` takes `timeoutMs`: TERM at the deadline, KILL 2 s later, exit 124.
  - Each step has a 120 s deadline. A hung optional step (weekly stats, PR kinds, health) is logged and skipped. A hung capacity read, sweep or send fails that tick.
  - The one `git` call in defs.ts without a timeout has one now.
- Each completed tick records `watcher_last_tick`. `hq health` shows it.
- `hq fleet ensure`, run by its own 5-minute timer, tells z-stu once when no tick has completed for 15 min, and once when ticks resume. It checks before it opens atc, so an atc outage cannot hide a stuck watcher.

## 0.23.1 — 2026-10-16

GEO-989.

- CI checks every `hq …` line in skills/ against `hq --help`, with `bun run check:skills`, a step in the required `check` job. A command, verb or flag that a skill uses and the help no longer names fails the job, which prints the skill file and line. It covers inline code and code-block lines.
- The `hq run lane` help line names `--lane LANE` in its usage, so the check sees it.

## 0.23.0 — 2026-10-16

For z-stu.

- `hq fleet ensure` will not spawn in a folder that Claude Code has not trusted, because the new session would hang at the trust dialog. The step fails with "<cwd> is not trusted by Claude Code; open claude there once and answer its trust dialog", and z-stu gets it through the fleet notice. A trusted parent folder counts. hq reads ~/.claude.json and never writes it.
- `hq health` has a fleet-trust check for each folder the fleet spawns in, naming the sessions a respawn there would hang.

## 0.22.0 — 2026-10-16

For z-steward.

- `hq news add --topic report`, for the morning reports and other reports. Until now they used `other`. The digest lists report news under its own heading.
- Schema v15 rebuilds the `news` table to widen its topic check. Every row, its read state and the id sequence are kept. The migration backs up hq.db first.

## 0.21.1 — 2026-10-16

- `hq kinds sync` spaces its per-day GitHub searches 2.1 s apart (`HQ_SEARCH_GAP_MS`). The search API allows 30 requests a minute, and the first 8-week backfill hit the limit.

## 0.21.0 — 2026-10-16

For z-stu (the owner).

- Bug share by week: `hq kinds [--weeks 8]`, also a section of `hq stats`. Weeks start Monday 00:00 Sydney. It has three tables:
  - Merged zgeoff PRs by title kind (fix, feat, chore, docs, test, refactor, other). Bug % is fix PRs over all merged PRs.
  - Merged PRs by their Linear issue's Type label (Bug, Feature, Improvement, Chore, Design, Investigation, no type). The issue comes from the PR body's Fixes/Contributes to/Related to line. Bug % is PRs for Bug issues over PRs with an issue.
  - Linear issues completed, by Type label, in the Sydney week they closed, with canceled issues counted apart. Bug % is Bug issues over completed issues.
- `hq kinds sync [--weeks 8]` is the backfill: one `gh search` per UTC day, plus Linear. The watcher syncs yesterday and today every 30 min and re-reads Linear's last 2 days. `hq stats` fetches up to 3 missing days itself.
- Schema v14: `merged_prs`, `merged_pr_days` and `linear_issues`. The migration backs up hq.db first.
- The Linear key is a 1Password item. hq reads it at run time with the global profile's token and keeps it in memory only.
- The restart notice and `hq wake` name the source repo of the loop prompt, such as "from hq's origin/main".

## 0.20.1 — 2026-10-16

For z-stu.

- The hq-lanes watcher keeps hq-defs' working tree on origin/main: each tick fetches and fast-forwards it. A dirty tree, another branch, local commits or a wrong origin is refused and never reset. `hq defs sync` runs the same step by hand.
- `hq health` has a defs-tree check: it fails on a refused sync, or when no sync ran for 30 min.

## 0.20.0 — 2026-10-16

- Move step 3: `hq defs [status] | setup <src> | check [src] | use <src>` picks the repo the fleet's skills and start prompts come from, nixie-definitions or hq. The switch is ~/.local/share/z-sessions/defs-source (no file means nixie-definitions). `hq defs use` writes it only after a preflight passes: every declared role prompt reads from the source's origin/main, and capacity.sh and pacing.json are in its working tree. The switch is logged as an event.
- hq's checkout for the fleet is ~/.local/share/atc/workspaces/hq-defs; `hq defs setup hq` clones it. The capacity script, start prompts and wake read from the chosen source. The transcript backup filter includes hq-defs.
- `hq health` names the current source in the defs fetch line.

## 0.19.2 — 2026-10-16

- `hq run lane` takes the lane as `--lane <lane>` too, and splits a quoted "ISSUE LANE" given as one word. In 0.19.1 both forms failed with "no run for GEO-n lane" or "--lane is required".

## 0.19.1 — 2026-10-16

For z-delivery.

- `hq run sweep` no longer says a session "has exited" when its run's open PRs are all final
  and reviewed at their heads: the work is handed in, and z-delivery may have put the session to
  sleep until the merge window (GEO-957, cloud#296). A head that moved after the review is
  flagged as before.

## 0.19.0 — 2026-10-16

For z-stu (the owner's lane split) and z-steward (the lane field). Schema v13.

- Lanes by area, sized from pacing.json `lanes` (imp: nixie-slice 3, nixie-maintenance 2, atc 2,
  imp 2, cloud 1; local: flexible 2). A change to pacing.json needs no hq release.
- A run's lane: `hq run add --lane LANE`, `hq run lane ISSUE LANE`, or a `lane` note (which the
  skill uses today). The migration fills each run's lane from its latest `lane` note; a run on
  this host with none is flexible. A run counts while working or blocked; a run with place none
  has no agent and doesn't count.
- Ready per lane: `hq lanes ready --lane nixie-slice=3,atc=0,...`, stale after 30 min. The total
  form `--count N` still works.
- The watcher nudges by lane: one message names each lane with free slots for 10+ min, its free
  slots and Ready. An imp lane with free slots and 0 Ready lends them to an area with more Ready
  than room, nixie first and flexible last; a lane with 0 Ready and no one short isn't named.
  A repeat needs a change or 30 min, as before. Imp memory still caps the imp lanes.
- `hq lanes status` shows the imp room and each lane's running/size, free slots, Ready and
  lending; `hq run list` shows each run's lane and the running count per lane.
- A migration backup no longer fails when a hand backup took the same second's name.

## 0.18.0 — 2026-10-16

For z-stu and z-steward (decision D-daily-reports), and for z-delivery. Schema v12.

- Morning reports: from 08:15 Sydney time (DST-aware), once per Sydney day, the watcher messages
  z-stu that the morning reports are due, with yesterday 00:00–24:00 and today 00:00–08:30 in
  Sydney time (UTC given too). A run after 08:45 says it is late.
- Each run is a `job_runs` row (the first job of the later `hq watch` job table). `hq morning`
  shows today's text and recent runs; `hq morning skip [--date D] --reason T` marks a morning done
  by hand; `hq morning tick` runs the step once.
- `hq health` flags a morning with no run by 08:45 Sydney, or whose message failed to send.
- `hq health` checks hourly that hq can fetch nixie-definitions' main, so a broken GitHub
  credential shows before a restart needs the start prompts.
- A refused `git fetch` of nixie-definitions is retried once after 10 s; the error names which
  credential variables were set (names only, never values).
- Stays on `bun:sqlite`: Kysely starts with GEO-1020 (decision 23).

## 0.17.0 — 2026-10-16

For GEO-1014. The lanes watcher comes back after a crash or a reboot.

- `hq lanes start` installs `hq-lanes` as a user unit at `~/.config/systemd/user/hq-lanes.service`,
  enables it and restarts it, in place of a transient `systemd-run` unit. The unit has
  `Restart=on-failure` with a 5 s delay, restarts after a plain `kill` too, and starts at login
  (`WantedBy=default.target`). It replaces a running transient watcher, and keeps the installed
  interval when `--interval` is not given.
- `hq lanes stop` disables the unit as well, so the watcher stays off after a reboot.
- `scripts/install.sh` runs `hq lanes start` when the watcher is installed or running, so both give
  the same unit. `hq lanes status` shows whether the unit is enabled.

## 0.16.3 — 2026-10-16

For z-delivery.

- `hq run reopen <issue> [--next T]`: a done or dropped run goes back to working, keeping its
  sessions and PRs. The refusal on `hq run add` and `hq run pr` named this command, but it did
  not exist. An open run is refused: there is nothing to reopen.

## 0.16.2 — 2026-10-16

For z-steward (GEO-924).

- `hq fleet` declares z-qa: opus, in the nixie-definitions checkout, its start prompt from
  `skills/preview-qa/references/session-prompt.md` on origin/main, woken after a restart.
- REQUESTS.md: the decisions and requests from 2026-10-16.

## 0.16.1 — 2026-10-16

For GEO-1016. A command sends only the messages it queued.

- Each command records the outbox rows it queues and sends only those. A command that queues
  nothing sends nothing. This replaces the list of read-only commands, which missed new ones
  twice (0.10.0, 0.13.0), so a command not on it sent other commands' messages.
- The lanes watcher and `hq outbox flush` still send every pending row.
- `hq outbox forward` moves the queued rows but no longer sends them at once. The next watcher
  tick or `hq outbox flush` sends them.
- Inside an atc session, the detached unit runs `hq outbox flush --ids N,M` and sends only the
  rows of the command that started it. The command waits only on those rows.

## 0.16.0 — 2026-10-16

For z-stu (GEO-998, approved by the owner). Schema v11.

- `hq run final <pr> --sha S --fixed N --followups GEO-1,GEO-2`: at a PR's final, z-delivery
  records how many review findings the PR fixed itself and the follow-up issues filed from its
  review. Saying it again replaces the count.
- `hq followup add GEO-n --backfill --at TIME [--from repo#n]`: the baseline, counted by hand from
  Linear and labelled "linear backfill". `hq followup [list]` and `hq followup drop GEO-n`.
- `hq stats` gains "Review follow-ups": weekly follow-ups and same-PR fixes in 7-day weeks around
  the mark for nixie-definitions#135 (mark 44), with the 2-week baseline before it. Same-PR fixes
  show "no baseline": they were not recorded before the rule.
- Committed tables of hostile inputs for `--followups`, `--fixed` and the backfill.

## 0.15.0 — 2026-10-16

For z-stu (decision D-typed-log). Schema v10.

- `hq typed add --to SESSION --text T|--text-file F --source SOURCE` records a line a session
  typed into another session as the owner: the target (as given, plus its atc id and name when atc
  knows it), the full text, the time, who typed it, and where the owner said it.
- A source is `call:<id>` or `proposal:<id>` (hq checks it exists and is that kind) or
  `chat:<typing session id>@<time of the owner's message>` (a short id is expanded through atc).
  Any other form is refused; a committed table of hostile sources is in the tests.
- `hq typed [list] [--session S] [--limit N]`: newest first, by target name, id or id prefix.

## 0.14.1 — 2026-10-15

For z-stu (the owner's decision 6: every allow-or-deny check has a committed table of hostile
inputs, and an unknown input is denied).

- `hq review` asks Codex one more question: "For any allow-or-deny check this diff adds or
  changes: what does an unknown input get, and is there a committed table of hostile inputs it
  must refuse?" `codex review --base` takes no custom prompt, so the question goes to a second,
  read-only `codex exec` in the same worktree.
- The answer goes in the review file under "Allow-or-deny" and in the `hq review` output. A
  failed pass is reported with its exit code; it does not fail the review.

## 0.14.0 — 2026-10-15

For z-stu (from the owner's decision on ticket sizes). Schema v9.

- `hq run add ... --size S|M|L|XL --lines N` stores triage's size guess (lines changed, tests
  included). `hq run size ISSUE --size L --lines 3000` sets or corrects it later. hq refuses a
  line count outside its band: S under 500, M 500 to 2,000, L 2,000 to 5,000, XL over 5,000.
- `hq stats` gains "Size guesses": for each merged run in the window, the guess against the
  additions plus deletions of its merged PRs, by band (median actual/guess, runs outside the
  band, the widest misses), and the share of runs that shipped as a stack (a PR based on
  another PR's branch, now or before a retarget).
- GitHub facts for a merged PR are read once through `gh api graphql` and cached in the meta table.

## Repo — 2026-10-15

For z-steward (step 1 of the plan to move the fleet into hq, agreed by the owner).

- Changes reach `main` only by PR. CI runs the oxfmt check, typecheck and `bun test`.
- `.github/CODEOWNERS` records the path rule: z-q owns `src/`, `test/` and `scripts/`;
  z-steward owns `skills/` and `docs/`.
- README: the PR flow and the Codex review gate.
- Markdown and JSON files reformatted with oxfmt. No change to the `hq` binary.

## 0.13.2 — 2026-10-15

For z-stu. Start prompts come only from main, as the owner approved them.

- `hq fleet` and the `hq wake` loop text read each prompt with `git show origin/main:<path>`
  after `git fetch origin +refs/heads/main:refs/remotes/origin/main` in nixie-definitions.
- hq refuses when the fetch or the read fails. It never reads the working tree or an older fetch.
- The 0.12.3 fallback to the old loop file is gone. When the read fails, the wake message tells
  z-delivery to re-arm from the /loop line of its start prompt as it stands on main.
- A prompt given as a file path must sit outside every git work tree, symlinks included
  (z-q's own prompt).
- A dry run writes no hq file; its fetch moves only origin/main.

## 0.13.1 — 2026-10-15

For z-steward.

- `hq mark drop ID` removes a mistaken mark; its event keeps what the mark said.
- Live: dropped mark 26, a second mark for nixie-definitions#123 (mark 25 stays).

## 0.13.0 — 2026-10-15

For z-stu (the owner left the design with us). Each metric names who acts on it.

- `hq stats [--since 7d|36h|TIME] [--json]` reports four things:
  - Waiting on the owner (z-stu): call queue → answer → apply, unblock items added → done,
    and run time waiting on the owner, each with the oldest open item.
  - Merged to live (z-delivery): last merge → run done by repo, plus runs merged and not
    yet live, by repo.
  - Idle capacity while Ready work waited (z-delivery): nudge conversion, and a flag when
    the Ready count is stale.
  - Flow (the steward and z-delivery): PRs merged by repo (all zgeoff, from GitHub through
    gh, cached 30 min), review rework (PRs that needed a re-check), and cycle time.
    Under 5 samples is flagged as too few to act on. Rows from before 2026-10-14T20:00Z
    (the bulk import) are left out. `hq stats` sends and changes nothing (apart from its gh cache).
- `hq mark add --kind skills|grant|hq|other --text T [--ref] [--at]` and `hq mark list`
  record system changes. `hq stats --around ID` compares the 7 days before and after. The
  watcher marks each new hq version once.
- New inputs: `hq run add --ready-since TIME` (cycle time from Ready, from Linear) and
  `hq run state --waits-on-geoff | --not-geoff` (exact; otherwise hq matches the owner's
  first name in waits-on and says how much was matched that way).
- The watcher files one `hq news` line with the week's headline numbers, every Monday from
  08:00 Sydney.
- Schema v8: a marks table, runs.ready_since and runs.waits_on_geoff. The migration backs up first.
- Codex review: 3 findings, all fixed. `hq stats` could send queued messages. A later
  reopen hid an earlier completion. Two watchers could file the weekly line twice.
  Re-check: clean.

## 0.12.4 — 2026-10-15

For z-stu.

- `hq outbox forward FROM TO`: messages for a retired session go to the one that took over
  its work. New messages follow the forward when they are queued. Unsent ones queued for
  FROM move when the forward is set; one whose event already reaches TO is merged.
  `hq outbox forwards` lists them, and `forward FROM --remove` ends one. Loops are refused.
- `hq outbox drop ID` deletes one unsent message.
- flush reads each row again before and after it resolves the session, so a forward or a
  drop mid-flush is honoured.
- Live: z-refine → z-triage (z-refine's check merged into z-triage). Item 107 dropped, as asked.
- Codex review: 2 findings (a forward or drop could race a flush; loop checks stopped at 5
  hops): fixed. Re-check: 2 more (the race while atc resolved the old name; a stale failure
  could disable the moved row): fixed by checking the row again after the resolve.

## 0.12.3 — 2026-10-15

For z-steward.

- `hq wake` re-arms z-delivery's loop from the reviewed repo, not a hand-kept file. The
  text is the ```text block of skills/delivery-lead/references/session-prompt.md in the
  nixie-definitions checkout, minus its leading "/loop ". hq writes it to
  ~/.local/share/z-sessions/hq-delivery-loop-prompt.md (0600) and points the orchestrator's
  wake message there. If the repo read fails, hq falls back to delivery-loop-prompt.md and
  says so in `hq wake` output and in the restart log. A dry run writes nothing.
- The start-prompt reader moved to src/prompts.ts, shared by `hq fleet` and `hq wake`.
- Codex review: 1 finding (the wake tests wrote the real hq-owned prompt file): fixed. Every
  prompt path is now inside the test dir, and the stray file is removed.

## 0.12.2 — 2026-10-15

For z-steward.

- z-refine is no longer declared in `hq fleet`. It merged into z-triage (nixie-definitions
  #119), and skills/refinement/ is gone. A retired name that is no longer declared drops
  out of the retired list. Comments that named z-refine's check now name z-triage's.

## 0.12.1 — 2026-10-15

For z-stu.

- `hq fleet remove NAME` retires a declared name, for a role merged away (z-refine into
  z-triage). After that, `ensure` never spawns it, and its wake-list entries go. hq stops
  nothing. `hq fleet restore NAME` takes it back. `hq fleet` lists the retired names.

## 0.12.0 — 2026-10-15

For z-stu (the owner: yes).

- `hq fleet`: the declared z- sessions (z-stu, z-delivery, z-refine, z-triage, z-steward,
  z-q). Each has a cwd, the model, and a start prompt. A role's prompt is the one ```text
  block of its session-prompt.md in the nixie-definitions checkout. z-q's prompt is
  ~/.local/share/z-sessions/z-q-prompt.md, outside git.
- `hq fleet ensure [--dry-run]` (a timer every 5 min, plus on demand): when a name has had
  no live session for 10 min, hq spawns one with its prompt, pins it, swaps its id into the
  wake list, and tells z-stu. During quiet hours the message waits; the spawn does not.
- Never a duplicate: hq waits while atc restores (a restart under 10 min ago, or a session
  atc still means to run, for up to 60 min). A known id that is live under another name
  counts as present. A known id missing from atc's list waits 30 min. Each gap uses one
  idempotency key. hq never stops a session.
- `hq fleet [status]` and `hq fleet timer install|remove`.
- Codex review: 3 findings, all fixed. A renamed or asleep session could be duplicated. An
  incomplete list could spawn during a restore. Malformed prompts reached the spawn.
  Re-check: 2 more. A dead session marked 'run' blocked a respawn forever: fixed with the
  60-minute cap. A list that hides a known live session for 30 min could still allow a
  duplicate: logged as a follow-up, since a list asked for outside every session sees
  every session.

## 0.11.0 — 2026-10-15

For z-stu (the owner: yes).

- `hq backup`: encrypted restic snapshots of hq.db, the rest of ~/.local/share/z-sessions,
  and the transcripts of the frankie-main workspaces and hq. hq.db goes through sqlite's
  online backup and an integrity check, never a file copy.
- Each run keeps a local repo (~/.local/share/hq-backup), prunes it to 48 hourly + 14 daily,
  and copies to a remote restic repo when ~/.config/hq/backup-remote.env exists (a
  RESTIC_REPOSITORY and its credentials). The run then checks that the newest snapshot
  reached the remote.
- Commands: `hq backup [status]`, `run`, `test [--remote]` (restores the newest snapshot
  to scratch and checks hq.db), `restore --to DIR [--snapshot ID] [--remote]` (empty
  directory only), `timer install|remove` (an hourly systemd user timer, real unit files).
- The restic key is ~/.config/hq/backup-password (0600). It must also be kept off this PC.
- `hq health` flags a backup with no good run in 3 h (`backupMaxAgeHours`) once backups exist.
- restic 0.17.3 installed to ~/.local/bin from the official release, checked against its SHA256SUMS.
- Codex review: 3 findings, all fixed. A remote secret reached argv and errors. RESTIC_HOST
  could hide the copy. A loose password file stayed loose. Re-check: the redaction missed a
  URL that restic reshapes. That is a security defect, so it was fixed after the re-check:
  remote failures now report only the step and the exit code.

## 0.10.1 — 2026-10-15

For z-stu.

- `hq health` ignores systemd-networkd-wait-online.service by default. WSL fails it at
  every boot, because WSL's network is not managed by networkd. The ignore list is still the
  `ignoreUnits` setting.

## 0.10.0 — 2026-10-15

For z-stu (the owner: Lgtm).

- `hq health`: read-only checks on this PC. It looks for failed systemd user and system
  units, restart loops (NRestarts gained within a window), and free disk on / and the home
  filesystem. It also checks memory pressure and available memory, that the atc daemon
  answers, and that the hq-lanes watcher is active. `hq health` shows every check
  (`--json` gives `healthy` and the checks), and it sends nothing.
- The watcher runs the checks each tick. New problems go to z-stu as one "Needs Geoff"
  message per tick. A problem is told once while it lasts. When it clears, hq files a
  silent `hq news` item (topic fix). hq never stops, starts or restarts anything.
- Thresholds: `hq health settings`, `hq health set KEY [VALUE]`. The ignore list
  (`ignoreUnits`) skips `run-r*.service` (systemd-run leftovers) and `app-*.scope` by default.
- Codex review: 3 findings, all fixed. `hq health check` could send queued messages. A
  hung command could stall the watcher. A failed read cleared open problems. Re-check: 2
  more, both fixed. The send guard read flag positions; it now reads the parsed command
  words. A timed-out command stayed alive; checks now run under `timeout -k 2 15`.

## 0.9.0 — 2026-10-15

For z-stu (and z-steward, for the skills).

- `hq news`: sessions file one-line items for the owner instead of messaging z-stu.
  `hq news add --topic merge|release|deploy|fix|other --text T [--from S] [--issue GEO-n]
  [--link URL] [--needs-geoff]`. Adding sends nothing, except `--needs-geoff`, which
  tells z-stu at once. `hq news` lists unread items grouped by topic, oldest first;
  `hq news read --upto N` marks them read; `--all` shows history. `--json` on all.
- Schema v7 (the news table). The migration backs up hq.db first.
- Codex review: 1 finding (a limited digest showed the newest items, so its read hint
  could mark older unseen items read): fixed; unread items list oldest first.

## 0.8.0 — 2026-10-15

For z-delivery.

- `hq lanes hold --minutes N --reason TEXT` pauses the free-slot nudges while slots stay
  free on purpose (a host switch, a restart). It ends by itself (at most 24 h), and
  `hq lanes release` ends it sooner. A hold drops an unsent nudge. The free time keeps
  counting, so a nudge can go out at the first look after the hold ends. `hq lanes status`
  shows the hold.

## 0.7.9 — 2026-10-15

For z-stu (z-refine relies on it).

- Fix (0.7.7 regression): after a detached send, a command reported nothing in `notified`,
  so z-refine thought hq had not told z-stu and sent its own "call ready". The command now
  waits up to 15 s (HQ_SEND_WAIT_MS, at most 60 s) for the unit to settle its messages and
  reports `notified` as before: sent, failed, dropped, plus `pending` (still sending at the
  deadline) and `detached` (the unit). A live send settled in 0.27 s.
- Codex review: 3 findings. A --retry reported an old failure before the unit retried:
  fixed (a failed row counts once its attempts go up). An invalid wait value could hang:
  fixed. A row a newer notice supersedes mid-send reports as dropped: unchanged, the same
  as an inline send.

## 0.7.8 — 2026-10-15

For z-delivery.

- `hq restart`: atc's restart exits 1 when sessions are still restoring at its check
  ("waiting to restore"), though cloud restores finish about a minute later. hq now waits
  up to 180 s (HQ_RESTORE_WAIT_MS, at most 600 s) for those sessions, logs each one as
  "restored late" or "still down", and ends with "the restart is good" when all came up.
  Then it wakes, so a late session is woken too.
- The wake uses the restart report hq read right after the restart, not one a later
  restart wrote.
- Codex review: 2 findings (an invalid wait value made the wait endless; a later report
  could replace the one the wake used), both fixed.

## 0.7.7 — 2026-10-15

For z-stu.

- Inside an atc session, hq hands its sends to a detached systemd unit outside the
  session's process tree. atc 4.7 binds a sender to the session it runs in, so the
  answers to hq's FYIs came back to z-stu as <atc-answer> notices. Sent from outside, the
  message arrives as kind "local" from "hq" (atc 4.8, GEO-901) and its answer goes to no
  session. If the unit can't start, hq sends inline as before.
- Held from 0.7.4 until atc 4.8: atc 4.7 labelled such a sender "owner".
- Codex review: 3 findings (a missing systemd-run skipped the fallback; a relative HQ_DB;
  inherited ATC_SESSION_* could detach again), all fixed. Re-check: 2 more. The database
  path is now always absolute. A unit that starts but can't run hq leaves its messages
  pending for the watcher (300 s); not changed.

## 0.7.6 — 2026-10-15

For z-delivery.

- Fix: `hq run session` and `hq run add --session` stored a short session id as given.
  The sweep and the note feed match full ids, so the sweep called those sessions exited
  and their notes (PR opened, FINAL) were dropped. hq now expands a short id to the full
  one through atc (a unique prefix; refused when atc is down or the prefix is ambiguous).
  `--remove` expands too, or falls back to the id as given.
- Live data: 5 rows held short ids (GEO-899, GEO-897, GEO-902, GEO-862, GEO-901). A one-off
  script rewrote them to full ids and recorded the 4 notes the feed had skipped (backup
  hq.db.bak-v6-shortids-20261014T235150Z first).
- Codex review: 2 findings. Removal with a prefix the add path accepts failed: fixed. The
  backfill could let an old FINAL override a newer one: not the case in this data (the one
  FINAL named a merged PR, which ignores it), so the one-off script stayed as it was.

## 0.7.5 — 2026-10-15

For z-steward.

- The wake messages for interrupted and background sessions add: "If you run a /loop,
  check CronList; when its jobs are gone, re-arm it from your start prompt's /loop line."
  A /loop's cron jobs live in the Claude process, so they vanish when atc restores the
  session. The orchestrator's message is unchanged.
- Codex review: 1 finding (two live sessions with the orchestrator's name get the new
  sentence); no change, since the sentence is conditional and points at their own start prompt.

## 0.7.4 — 2026-10-15

For z-steward.

- `hq review` takes `owner/repo` as well as a plain name (owner zgeoff).
- It finds a checkout in this order: `--repo-dir D`; `~/projects/<repo>` when its
  origin is the repo; else hq's own clone in ~/.local/share/z-sessions/repos/<owner>/<repo>,
  made with `gh repo clone` on first use. Before, a repo with no ~/projects checkout
  failed with "posix_spawn 'git'" (git ran in a directory that didn't exist).

## 0.7.3 — 2026-10-15

For z-delivery.

- Fix: the sweep compared a short final sha (from a FINAL marker) with the full
  reviewed sha, so a reviewed PR showed as "final, no review; head moved". Two shas
  now match when one is a prefix of the other, in the sweep, in `hq run`'s PR tag, and
  when a marker names the same final commit again.
- A run in state `blocked` no longer flags its final PRs as unreviewed.
- `bun run install-bin` restarts the hq-lanes watcher when it runs, so the watcher
  picks up the new code (0.7.3's first install left it on 0.7.2 until z-delivery restarted it).

## 0.7.2 — 2026-10-15

For z-stu.

- `hq status` lists every later item with its due time (it showed only the soonest).
- A "ready" notice whose item left the queue before the notice was sent (for example
  on a retry) is dropped, not sent. A notice atc already accepted can still arrive
  after z-stu acted on the item: atc holds it while z-stu is mid-turn, and hq can't recall it.

## 0.7.1 — 2026-10-15

- `hq run session <issue> <id> --add` adds a helper session beside the main one;
  `--remove` stops watching one. A plain `session` still replaces the main session and
  keeps helpers. The watch list and the sweep cover every active session; an exited
  helper's alert says how to remove it. Schema v6.
- Codex review: 1 finding (`--add` on the main session demoted it), fixed.

## 0.7.0 — 2026-10-15

`hq run`: z-delivery's Running table in hq (z-steward's request, agreed by the owner).

- Rows by issue (any slug), several sessions with one active, several PRs. Row states:
  working, blocked, merged (with `--waits-on`), deploying, deploy-held, live-check,
  done, dropped. Review state lives on each PR: final sha and its source, review
  started, reviewed sha, review round (one round plus one re-check; a third needs `--force`).
- Commands: `add`, `session`, `state`, `done`, `drop`, `next`, `gate`, `title`,
  `geoff-chat`, `pr`, `final`, `reviewing`, `reviewed`, `merged`, `closed`, `note`,
  `show`, `list` (the old table's shape), `watchlist [--write FILE]`, `sweep`.
- The watcher reads atc's event feed every 5 min and keeps each note from a session on
  an open row, so a note that lands during compaction still reaches its row. A note
  marks a PR final by the marker `FINAL <repo>#<n> <sha>`, or by "is final (again) at
  <sha>" when it names no PR outside the row. "Opened <PR URL or repo#n>" attaches the PR.
- Sweep: one message to z-delivery for a final PR with no review after 30 min (a head
  that moved after a review says so), an exited active session, or a session quiet
  60 min (not for rows the owner chats with). Each item repeats only when it changes or
  after 30 min; an undelivered item rides along with the next message.
- Outbox topics: only the newest unsent message per target and topic goes out (lanes,
  queue reminder, sweep). Schema v5.
- Codex review: 3 findings (notes lost on a feed reset; a dropped undelivered alert; a
  note about another repo's PR marked final), fixed. Re-check: 3 more in the fixes (reset
  read the newest page, not the oldest; a mixed note could still mark the wrong PR;
  same-second notes merged), fixed with tests. 103 tests.

## 0.6.0 — 2026-10-14

For z-steward's #91 (GEO-797, GEO-773).

- Queue reminder: the `hq-lanes` watcher messages z-stu once when a call or proposal
  waits and could open, but z-stu has not heard about it since it became openable (filed
  in quiet hours, fell due, or waited behind a hold). So a proposal filed at 05:00
  reaches z-stu soon after 07:00 Sydney.
- A re-add of an open call with a changed question still updates its issues.
- `hq release` with no hold is a no-op.
- Codex review: 3 findings fixed (a repeat reminder after an empty release; the latest
  07:00 missed across DST; same-second times hid a release). Re-check: clean.

## 0.5.1 — 2026-10-14

- `hq lanes`: a reported Ready count no longer suppresses nudges (a self-reported 0
  stopped every nudge while z-delivery later launched 7 agents). The count only goes in
  the message text, and it goes stale after 30 min (was 120). Nudges run on free
  capacity alone.

## 0.5.0 — 2026-10-14

Slice 2, and `hq lanes` for z-stu (the owner's request).

- `hq wake [--dry-run] [--wait S]`: after an atc restart, message the orchestrator
  (z-delivery, by name), each session the restart interrupted, and each live session on
  the wake list. Same text and idempotency keys as the old wake.ts, so running both for
  one restart still sends one message each. `hq wake list|add|remove|import <file>`
  keeps the list in hq.db (schema v3).
- `hq restart [--force]`: hands itself to `systemd-run --user`, then runs the atc dry
  run, the restart and `hq wake`, with a log in ~/.local/state/atc/hq-restart-*.log.
  A failed dry run stops before the restart. Refuses 23:00–08:00 Sydney without `--force`.
- `hq review <repo> <pr> [--no-watch]`: Codex review in a throwaway worktree, then CI
  checks (gh buckets) and the count of open review threads.
- `hq lanes start|stop|tick|ready --count N|status|log`: every 300 s, read capacity.sh,
  count agent slots (whole imps of free room while an unattended imp provider has quota),
  and nudge z-delivery once slots stay free 10 min with Ready work not known to be zero.
  No repeat until the state changes or 30 min pass. Each nudge logs the slots still free
  10 min later; `hq lanes log` also shows idle slot-minutes over 24 h (schema v4).
  hq has no Linear read: the Ready count is unknown unless a session reports it.
- The lanes unit runs with `--collect`, so a crash never blocks the next `hq lanes start`.
- Known behaviour: each watcher tick also retries every failed outbox message (calls,
  proposals, unblock too). The idempotency keys make a retry harmless at atc.
- Not yet run live: `hq restart` and `hq review` (tests only). `hq review` had no Codex
  review (no restarts, migration or messaging). `hq wake --dry-run` and `hq lanes tick`
  ran live.
- Runs from source need `HQ_DB` (or `HQ_LIVE=1`): no accidental live migrations.
- Codex reviews (restarts and messaging): wake/restart, 2 findings fixed (`restart --here`
  skipped the quiet-hours guard; the detached child lost `HQ_LIVE`). Lanes, 3 findings
  fixed (a nudge burst after an atc outage; an imp error read as full lanes; the systemd
  unit dropped `HQ_` settings). Re-check: all closed; it named one more burst case (an old
  backlog), now pruned on every tick.

## 0.4.0 — 2026-10-14

- `hq pins` (z-steward, for the owner): every pinned atc session with id, name, state
  (working, idle, needs_you, exited, asleep), last activity and idle time, longest
  idle first. `--json` gives `pins[]` with `idleMs` (null while working).
- `hq --version` works again.

## 0.3.0 — 2026-10-14

For z-steward's refinement skill draft (nixie-definitions#91).

- `hq call|proposal add --order N`: the check's send order. `hq open` picks the lowest
  order first, then items with no order, oldest first. A re-add updates the order; a
  re-add without `--order` keeps it; `--order none` clears it. Schema v2 (`send_order`).
- `hq unblock add` without `--rank` keeps the rank set with `hq unblock rank`;
  `--rank none` clears it.
- hq.db backed up before the v2 migration (manual copy, plus hq's own `VACUUM INTO`).

## 0.2.0 — 2026-10-14

Slice 1, for z-stu: calls, proposals and the owner's unblock list.

- `hq call|proposal add|open|answer|apply|later|skip|close|show|list`. States:
  queued → open → answered → applied, plus later (due date, default next 07:00
  Sydney), skipped (back on re-add) and closed (no longer needs the owner).
- One open call or proposal at a time, enforced by a unique index.
- `hq open` refuses 03:00–07:00 Sydney and while `hq hold` is on; `--force` overrides.
- Re-adding the same id and question is a no-op, even once answered: nothing reaches
  the owner twice. An issue that joins a shared call keeps the id.
- `hq unblock add|list|new|pushed|done|drop|rank|show`: computed rank (Urgent/High
  first, then most unblocked, then fewest minutes), `rank` overrides, and a push cursor.
- `hq status`: open item, next item and why it waits, counts, unblock, outbox.
- Outbox: atc messages queue in the same transaction and send after commit, with an
  idempotency key per event. A failed send stays for `hq outbox flush --retry`.
  Messages: "ready" to z-stu when another session files; a courtesy note to the
  filer on answer, later, skip and close (it carries no grant); "done" to the
  sessions an unblock item names.
- Own atc wire client (protocol v4): no import of atc from source.
- Database: `~/.local/share/z-sessions/hq.db`, WAL, `VACUUM INTO` backup before a migration.
- Codex review of d719ba8 (required: the outbox messages other sessions). 3 findings, all fixed:
  1. hq read `ATC_SOCKET`, which in a session is the reporter socket, so sends timed out (4b1bcf3).
  2. `hq unblock pushed` moved the cursor past items added after `hq unblock new` read the
     list; it now takes `--upto` from `new` (33cc1f3).
  3. Re-adding an answered call after close or skip asked the owner the same question again;
     answered-then-closed is now a no-op, answered-then-skipped a new round (5b4d955).
     Codex re-check: all three closed, no new bug. It named one older gap, the socket path
     without `XDG_RUNTIME_DIR`; hq now follows atc's own rule.
- Live check: a scratch database sent "call ready" to z-q through the real atc daemon.

## 0.1.0 — 2026-10-14

- Repo set up: Bun + TypeScript skeleton, README, CHANGELOG, REQUESTS.
- Typecheck on TypeScript 7.0.2 (native tsc).
- Stack chosen on merit: Bun (fast start, single compiled binary, shares the TS atc client), bun:sqlite in WAL.
