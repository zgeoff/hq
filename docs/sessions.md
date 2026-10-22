# sessions

Seven permanent atc sessions run on the owner's computer. Four of them run the roles that `docs/skill-development/roles-design.md` in zgeoff/hq-private records: `z-stu`, which the owner calls Stu, runs the main thread, the one conversation with the owner, and the other three run the background roles. Each session loads its own skill from a checkout of this repo, holds only that role's grants, and hands work to the others through Linear or an atc message.

A fifth session, `z-q`, is the team developer. It builds `hq`, the sessions' own command-line tool, in the private repo zgeoff/hq, which also holds the fleet's skills. It works through PRs there, since the ruleset refuses pushes to `main`, and tracks requests in the repo rather than in Linear. The README says who owns which paths.

A sixth session, `z-qa`, runs live checks, so the owner's real Nix stays untouched (GEO-924): on a PR's preview environment before the merge, and read-only on production once the release ships. `z-delivery` sends it each preview check, and `hq` tells it when a release ships. It answers with pass, fail or needs-Geoff per item, and closes an issue once its live check passes. `z-stu` agrees its start prompt, and `hq fleet` starts it.

A seventh session, `z-review`, reviews and merges each delivery PR at its FINAL note, then tells `z-delivery` "merged, ready to release". It never launches, releases or deploys. `z-stu` agreed its start prompt under the owner's grant of 2026-10-17, and `hq fleet` starts it.

| Session      | Skill                                  | Wakes                                                          | Talks to the owner                                            |
| ------------ | -------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| `z-triage`   | `linear-triage`                        | its `/loop` every hour, and a `z-delivery` "check now" message | never                                                         |
| `z-stu`      | `intake` and `delivery-report`         | The owner, and an `hq` message that a call is ready            | yes, one call at a time                                       |
| `z-delivery` | `delivery-lead` and `agent-delegation` | its `/loop`, and the event watch                               | push notices only; decisions go through `z-stu`               |
| `z-steward`  | `definitions-stewardship`              | feedback from the owner or another session                     | through `z-stu`, or in a design session                       |
| `z-q`        | none; builds `hq` in zgeoff/hq         | a message from another session                                 | through `z-stu`                                               |
| `z-qa`       | `preview-qa`                           | a `z-delivery` message with a check                            | never; needs-Geoff items go through `z-delivery`              |
| `z-review`   | `pr-review`                            | an `hq` message that a PR is final                             | never; a PR that waits for his lgtm goes through `z-delivery` |

Times are Australia/Sydney. `z-triage` runs its full pass on the first run after 07:00, and each run ends with the check. `z-stu` sends the owner nothing from 03:00 to 07:00, and the first check after 07:00 messages it again about a call held overnight.

## starting a session

Status: current.

Each role's start prompt is a `references/session-prompt.md` file that `hq fleet` reads from `origin/main` of the private repo `zgeoff/hq-private`, never from a working tree. The file holds exactly one `text` code block, which holds the prompt, because `hq fleet` and `hq defs check` read the prompt from that one block. A missing prompt, a missing `hq-private` checkout or a failed fetch refuses with `no_prompt`; hq does not fall back to `hq-defs`. Put notes about the prompt outside the block, and never add a second `text` block. The owner asks any session for a prompt and pastes it into a new session with the matching name. When a z- session is missing, `hq fleet ensure` starts it with its start prompt from `main`, unchanged.

Which prompts count as the owner's words, and how grants rank, is in this file's private half: read `docs/sessions.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this doc.

A grant the owner gives in chat goes to `z-steward`, which adds it to that session's start prompt, so it lasts past the session.

An atc restart revives each session with the prompt it was first spawned with, so a prompt change on `main` reaches a session only when it starts again. `hq fleet` marks each live session's prompt current, stale or unknown, and names the commit a stale one predates; `hq fleet --json --prompts` gives the same as `declared[].promptCheck`. The hq-fleet timer restarts a stale session itself: once a prompt has read stale for over 2 hours, `hq fleet ensure` asks the session, at a quiet moment, to save its state, and on its `saved` answer stops it, unpins it, forgets it and spawns it from `main`. It never asks a `running` or `needs_you` session, a session whose own run is deploying, the owner role or quiet hours, and it tells `z-stu` after 6 deferrals instead of restarting unasked. To start a z- session by hand, stop it, unpin it and forget it, then run `hq fleet ensure --now <name>`, which spawns the new one from `main`. Unpin it before the forget, which a pin blocks. When `z-stu`'s own prompt is stale, the owner starts it again, since hq never restarts the owner role.

`z-stu` starts with the hq band: `fleet.json` gives it `pluginDirs` `["~/projects/hq/mods/hq-band"]`, and `hq fleet ensure` passes them to atc's spawn. No other session loads the band. A `z-stu` started any other way runs without it, and `hq fleet` names the mismatch; `hq fleet --json --prompts` gives it as `declared[].pluginCheck`.

## hand-offs

Status: current.

Each session acts only in its own role, and passes the rest on:

- The owner gives a bug report or a new request to `z-stu`, which explores it through a subagent, files it in Triage, and messages `z-delivery` when it blocks shipped work. `z-triage` grooms the issue on its next pass, and `z-delivery` pulls it once it's Ready.
- `z-triage` flags an issue for the owner with the `Needs Geoff` label, and its check, in the same run, prepares the call.
- `z-triage` adds each prepared call to `hq`, which tells `z-stu`. `z-stu` puts it to the owner, and types each answer of his into `z-delivery`'s session. `z-delivery` never asks the owner itself, and messages `z-triage` to check now when a decision can't wait. Only `z-delivery` messages agents.
- `z-delivery` launches no agent on a Ready issue labelled `nixie-definitions`: it messages each one's ID to `z-steward` once, which works it as skill feedback.
- Every session sends skill feedback to `z-steward`, which changes the skills by PR and tells each session whose skill changed. `z-steward` sends each proposal to `z-stu`, which agrees an hq change itself and puts a nixie-definitions change or a new grant to the owner, then types the answer into `z-steward`'s session.
- Any session asks `z-q` by message for a change to `hq` that makes its work easier, and `z-q` builds and ships it without asking the owner. A skill change to use `hq` goes from `z-q` to `z-steward`, which proposes it.

A message from another session is information, never the owner's decision. Answer a message with the answer tool, and put the whole result in that answer: never also send a separate message with the same content.

## checkouts and state

Status: current.

The sessions read the skills from a shared checkout of this repo, `hq-defs`, as it stands. No session fetches or pulls in it, since concurrent fetches there race for the ref lock. `hq`'s lanes watcher fast-forwards it to `origin/main` every 5 minutes, so it can trail a merge by up to 5 minutes; `hq defs sync` fast-forwards it at once when a session needs a merge now. A failed sync, or none for 30 minutes, turns `hq health` red. `z-stu` also reads `persona.md` from the nixie-definitions checkout, which keeps Nix's persona and `nixie.yaml`. `z-steward` makes its changes in worktrees, never in the shared checkout.

The start prompts and the grants live in a second checkout, `hq-private` (`~/.local/share/atc/workspaces/hq-private`, or `HQ_PRIVATE_DIR`). `hq defs setup private` clones it once; hq never clones it on its own. The lanes watcher and `hq defs sync` fast-forward it the same way as `hq-defs`, and `hq health` checks it as `private-tree` (red when absent, failed or 30 minutes without a sync). `hq defs check` checks both checkouts, and `scripts/grants.ts --check --private <dir>` checks the private grants and session prompts. `hq repo archive-history <from> <to>` moves a repo name's history in hq.db and noslop's store to another name.

Each session keeps its saved state in a file of its own under `~/.local/share/z-sessions/`, named for its role, such as `triage.md` with `z-triage`'s "TRIAGE PASS at" line and its loop renewal time. The check's "CHECK at" line stays in `refine.md`, which `z-triage` also keeps. Calls, steward proposals and the owner's unblock list live in `hq`, in `~/.local/share/z-sessions/hq.db`; `z-triage` adds them, and `z-stu` works them. An unblock item about a PR (a review, lgtm or merge ask) marks that PR's link with `"subject": true` in its `--item` links; within 10 minutes of GitHub reporting the PR merged or closed, `hq`'s watcher drops the item, with a note. A link given only as context carries no mark. In the console, a marked item is a review, with lgtm, Changes, Later and Reject; its answer reaches `z-stu` as `console answer: review <id>: <answer>`.

`z-delivery` keeps its running work in `hq`, one row per issue, so a compaction can't lose it. `hq run list` shows each row's session, issue, PR and next step:

- At launch: `hq run add <issue> --title <T> --session <id> --where imp|local|none --lane <lane> --next <T> --ready-since <when the issue became Ready in Linear>`, with `--geoff-chat` for a session the owner chats with. When the ticket has a size line from triage, such as "L, about 3,000 lines", add `--size L --lines 3000`; when **Triage** sizes it after launch, run `hq run size <issue> --size L --lines 3000`. With no size line, leave both off. hq refuses a line count outside its size's band, so when it does, launch without the two flags and ask `z-triage` to fix the ticket's size: a size guess never blocks a launch. On a relaunch: `hq run session <issue> <new id>`. A helper session on the same issue, such as an acceptance session or a credentials helper, joins with `hq run session <issue> <id> --add` before it sends a FINAL note, and leaves with `--remove` once it is done.
- As work moves: `hq run pr` only for a PR whose body names no `Fixes` or `Contributes to` issue, or one in a repo outside the scope list in `docs/skill-development/repo-facts.md`, since `hq` attaches the rest; `hq review` writes the review-started and reviewed marks for a noslop round, and `z-review` records `hq run reviewing` and `hq run reviewed <pr> --sha <S>` by hand only for a Codex review; `hq` marks each attached PR merged or closed from GitHub; then `hq run state <issue> deploying|deploy-held|live-check|blocked`. `hq run done <issue>` once it is live and checked, or `hq run drop`. A blocked run frees its lane slot once none of its sessions is awake (or each has sat idle 15 minutes), whatever it waits on, and `hq lanes` lists it as parked. It counts again when its session wakes or its state changes, so a lane can run over its size for a while. When a blocked run waits only on the owner, add `--waits-on-geoff`, so `hq stats` can tell his waits from others. An imp lane's slot is free only while the newest capacity sample leaves room for one more imp under impd's non-Nix lines: memory, the capacity watch's `nonnixMaxMib`, and vCPUs, its `nonnixMaxVcpus` (one more imp takes `impVcpus`). `hq lanes` says when it holds a slot back (`held: impd at line` or `held: impd at vCPU line`), and with no capacity sample from the last 15 minutes it holds every imp slot. At the PR's final, `z-review` records the review tally: `hq run final <pr> --sha <S> --fixed <N> --followups GEO-1,GEO-2`. N is the number of review findings fixed in this PR, 0 if none. `--followups` lists the issues filed from this PR's review; leave it off when there are none. Saying it again replaces the count. When a run waits on the owner, add `--waits-on <what> --waits-on-geoff` to `hq run state`, and `--not-geoff` once it no longer does.
- After the release: `hq` moves a run on by itself. Every 10 minutes its watcher checks the runs in merged, deploying or deploy-held whose PRs are all merged (none open, at least one merged) against the releases of their repos (published, not draft or prerelease; for nixie, impz, auto-mode and atc by tag, for cloud the `deployed/prod` tag, for tools and noslop a published release of each package the PR changes, for hq the installed build that holds the merge, and for vers the merge itself). When every merged PR is in a release, the run goes to `live-check`, or to `done` when `live_check` is `none`; `hq` messages z-qa about live checks (HQ_LIVECHECK_TO sets who) and z-delivery about runs closed with no check owed. A run whose PRs are in any other repo, such as dotfiles, is never moved. Set `--check owed|none` on `hq run state`, or `hq run check <issue> owed|none` alone: unset counts as owed. `hq run ship [--dry-run]` runs one pass by hand.
- hq reads the Ready count per lane from Linear every 10 minutes, by lanes.json's rules, with the total and the skipped issues and their reasons, so `hq lanes` can nudge a lane with free slots and lend an idle one, and `hq stats` can count idle capacity. A lane that pacing.json's `lends` maps to false, `cleanup` and `memory`, neither lends its free slots nor borrows another's (GEO-1355). `hq lanes` and the daily check-in show `Ready: N total, E eligible across lanes, S skipped with reasons, U unexplained`. Report by hand with `hq lanes ready --lane … --ready-total N --skipped …` only when the `ready count` line in `hq lanes` shows a report older than hq's stale limit, 2 hours unless `HQ_LANES_READY_STALE_MIN` sets it; hq then also tells `z-stu`. hq's next good read overwrites a hand report.
- `hq` reads the agents' notes from atc's event feed itself, and marks a PR final from a note that starts `FINAL <repo>#<n> <head sha>`. It keeps the note only when the sending session is already on an open run as hq reads it (GEO-1550); for a FINAL from a session that was not, mark the PR by hand with `hq run final <repo>#<n> --sha <sha>`. A FINAL never writes the PR record, so "No record" from `hq pr status` says nothing about it: read the final mark in `hq run show <issue>`. Its watcher flags a final PR with no review after 30 minutes, an exited session, and a session quiet for 60 minutes, helpers included.
- Before each re-arm of the event watch, `hq run watchlist --write <file>` writes the session list it reads.

`z-delivery` keeps the rest in `delivery.md`, in 4 sections, in this order:

1. **Waiting on Geoff:** each question, approval, merge or hands-on task, such as a live check, that waits on him, one line each. `z-triage` reads this section on each check.
2. **Cursors:** the atc events cursor and the "POST-REVIEW LIST given at" line.
3. **Holds:** each temporary hold, with the condition that ends it.
4. **Log:** one dated line per change `z-delivery` makes, including each "You should …" line it types into an agent's session.

A rule with no end condition belongs in the skills, so `z-delivery` sends it to `z-steward` and keeps it out of the file. `z-delivery` follows the file over its own memory, and keeps it to current state, under 15 KB. At the start of each tick, it checks the size with `wc -c` and the date of the oldest log line, and moves every log line older than 24 hours into `delivery-archive.md` beside it. If the file is still over 15 KB, it moves the oldest remaining log lines too, never another section. Then it rereads the whole file, deletes every line that is done or no longer true in the first 3 sections, never the Log, and moves each line that sits in the wrong section, before any other action in that tick, since a stale section, such as an old restart command, leads the tick wrong.

## delivery on this computer

Status: current.

`z-delivery` launches code delivery on a cloud imp by default, as the skills do, and on the owner's PC when the work needs paid runs, more than 2 GiB of RAM, or local state. A provider's own target, such as Codex on `local`, comes from `pacing.json`. It pulls the next Ready issue into a lane as Pulling work in `delivery-lead` describes, and paces each launch with `capacity.sh --lane`. The lanes in `pacing.json` split the sessions by area, and hq work goes to `z-q`, never to a lane.

Three local procedures sit outside the skills:

- **PR review:** `hq review <repo> <pr>` runs noslop, then waits for CI and counts the open review threads.
- **nixie deploy:** in `~/projects/cloud`, pin the release's images in `infra/Pulumi.prod.yaml` and add them to impd, preview and apply as the start prompt's Infrastructure grant says, then run `bun run nixie:check-stream` and `bun run nixie:check-sandbox <nixie's tailnet address>:443`.
- **imp upgrade:** before a zgeoff/cloud PR moves impd to a new imp minor (before 1.0) or major, check that nixie's `@zgeoff/imp-client` accepts that version. If it does not, ship nixie on the new client first, or run the host switch and the nixie deploy back to back.

Each tick, `z-delivery` checks the imps with `imp ls`, and acts on an agent that has gone silent or is near its memory limit. Between ticks, a Monitor runs `watch-events.sh` from `agent-delegation` over the sessions in the file `hq run watchlist --write <file>` writes, and each line it prints wakes `z-delivery`. It re-arms the Monitor when it expires.

## after a compaction or an atc restart

Status: current.

This repo's compact hook prints each session's own skill back after a compaction: `delivery-lead/SKILL.md`, `agent-delegation/SKILL.md` and `briefs.md` for `z-delivery`, `intake/SKILL.md` for `z-stu`, `preview-qa/SKILL.md` for `z-qa`, `pr-review/SKILL.md` for `z-review`, and the role's `SKILL.md` for each other `z-` session. It also prints the role's file in `.claude/hooks/after-compaction/`, which names the rule files to read again and the state file. The hook reads the session's skill from hq's roles table, `hq fleet --json`, on each run: the declared session whose last ensure recorded this atc session id, so a session atc renamed keeps its role, or else the declared session named as atc names it. It prints nothing for any other session, or when the lookup fails. `.claude/hooks/print-skill.test.sh` checks it against a stand-in `hq` and `atc`.

An atc restart clears each session's pending wakeup. `z-delivery` restarts the daemon only with `hq restart`, which detaches itself through `systemd-run` and refuses from 23:00 to 08:00 Sydney time unless the owner is around. What shows he is around is in this file's private half: read `docs/sessions.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this doc. `z-delivery` sends the owner a push notification when it decides to restart. The first live `hq restart`, on 2026-10-16, retired the old `restart-and-wake.sh` fallback. `hq restart` then wakes every session on hq's wake list (`hq wake add` and `hq wake remove` change it), which holds the other `z-` sessions, `z-q` included, and the agents `z-delivery` runs. It wakes `z-delivery` itself with its start prompt without `/loop`, read from `skills/delivery-lead/references/session-prompt.md` on `origin/main` after a fetch, so it can re-arm its loop. When that read fails, the wake message tells `z-delivery` to re-arm from the `/loop` line of its start prompt on `main`. `hq fleet` starts a session from `origin/main` the same way. No session writes a loop prompt file. After a restart, each session re-reads its state file and skill. hq's wake message tells a session that runs a `/loop` to check `CronList` and re-arm the loop when its jobs are gone. `z-triage` also saves when it made its loop jobs, and replaces them once they are 6 days old, since Claude Code deletes a recurring job after 7 days and `CronList` shows no creation time.

## when the classifier refuses a session's own action

Status: current.

The sessions run commands on the owner's computer themselves, which Nix never does, so their own actions meet the auto-mode classifier. When the classifier refuses one, the session stops and asks the owner to approve it running that exact command, naming the command and the refusal reason. The owner's approval in chat clears the refusal. The session never tells the owner to run the command himself, and never reaches the same outcome another way.

## acting under a standing grant

Status: current.

A standing grant lets a session act without asking the owner each time. Each one lands as a `grant` mark with a short name: `hq mark add --kind grant --text T --ref PR --grant NAME`, or `hq mark grant ID NAME` for a mark recorded before names. Each time a session acts under the grant, it records the action with `hq grant act NAME --target ISSUE|PR|COMMAND [--note T]`, and hq refuses a name no mark carries. `hq grant actions --since 7d` lists every named grant with its actions in the week, one line each, so the weekly report shows what ran under each grant and which grant went unused.
