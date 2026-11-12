# Holds

You are `z-review`, the session that merges PRs. [What holds a merge](../SKILL.md#what-holds-a-merge)
lists every hold. This file covers these three. `hq review gate` enforces the first two, in this
order, and you enforce the third:

1. [The skill proof](#the-skill-proof), on a PR that changes a skill's `SKILL.md` or references:
   ticked check lines in the PR description.
2. [The owner's lgtm](#the-owners-lgtm), on a PR that changes a file the owner holds, such as an
   `AGENTS.md` or a skill. That section lists the files for each repo, and the records of yours that
   clear some of them.
3. [A preview check](#a-preview-check), on a PR with a preview.

In this file, `<repo>` stands for the repo's name, such as `cloud`, and `<pr>` for the PR's
number. hq commands also take `zgeoff/<repo>`. The agent is the session that opened the PR. It
sends a FINAL note when the PR is ready for review, as [Take a PR](../SKILL.md#take-a-pr) says.
`stu`, `z-triage`, `z-delivery` and `z-qa` are the fleet sessions that
[owner-calls](../../owner-calls/SKILL.md#terms) describes.

Merge only once each hold that applies has cleared and the gate passes, as
[Merge](../SKILL.md#merge) says. The gate passes when `hq review gate <repo> <pr>` exits 0. When it
exits non-zero, it prints `merge_blocked` and the reason.

Never tell another session that the owner gave an lgtm, even when you saw the owner say it. The gate
reads only the answers that `stu` records with `hq pr answer`, so a message clears no hold. Wait
until `hq pr status <repo> <pr>` shows the answer that `stu` recorded.

- [Nix's own skill PRs](#nixs-own-skill-prs)
- [The skill proof](#the-skill-proof)
- [The owner's lgtm](#the-owners-lgtm)
- [The owner's answer](#the-owners-answer)
- [A preview check](#a-preview-check)

## Nix's own skill PRs

Merge a PR of Nix's own skills once `hq review gate` passes on green CI. The PR needs no Checks
lines. Like every nixie-definitions PR, it needs no owner lgtm. Nix is the agent defined in
zgeoff/nixie-definitions, and she owns her skills. The gate counts a PR as Nix's when it comes from
a `nixie/skill/` branch in nixie-definitions, not from a fork, and changes only `skills/`. Any other
nixie-definitions PR follows the rest of this file.

1. Check that the PR is ready, and review it with `hq review`: steps 1 and 2 of
   [Take a PR](../SKILL.md#take-a-pr). The gate holds a PR with no
   [noslop](noslop.md#findings) review at its head.
2. Skip step 3 of Take a PR. On Nix's PR, a noslop finding needs no answer unless the gate holds
   it.
3. Run `hq review gate <repo> <pr>`. On Nix's PR, the gate holds an open finding whose lens is
   `security`, or whose lens hq didn't store. The gate's reason lists each held finding's ID.
   `hq review` prints each finding's lens before its title, and stores the lens with the review.
4. Send each held finding to `z-triage` as a decision for the owner, as
   [owner-calls](../../owner-calls/SKILL.md) says.
5. Once the owner decides, close the finding as [Unfixed findings](noslop.md#unfixed-findings)
   says, or send it to the agent as a finding when the owner wants it fixed. The hold clears when
   no held finding is open.

## The skill proof

The gate holds a PR that changes a skill's `SKILL.md`, or any file under its `references/`, in a
`skills/` folder anywhere in the repo, `.claude/skills/` included. A `skills/` folder that sits
under a `fixtures/` folder, such as a test's copy of a skill, doesn't count. To clear the hold, the
PR description's `## Checks` section needs these three ticked lines, and one bullet under
`Declined:` for each finding the agent declined:

- `- [x] chex prose, links and skill: cleared`
- `- [x] Cold read: <n> fixed, <n> declined`
- `- [x] Deslop: <n> edits`

The gate holds the PR while the bullets under `Declined:` number fewer than the cold read line's
declined count. When that count is 0, the gate needs no `Declined:` line.

The gate checks the proof before the owner's lgtm, so the owner never approves a description that
still has to change. Check the proof like this:

1. Once every review finding is answered, run `hq review gate <repo> <pr>`.
2. If the gate blocks on the proof, message the agent the gate's reason word for word. The agent
   adds the lines that the reason names.
3. Read the reason the agent gave for each declined finding. Judge it by the
   [fix-it-here](../../fix-it-here/SKILL.md) skill, and send back each one that fails.
4. After a push that changes skill text, ask the agent to run the checks again and update the
   lines. The gate keeps no record of the head the checks ran on, so it can't tell that the proof
   is stale.
5. To check the chex line yourself, run chex on the PR's head, in a worktree of your checkout:

   ```bash
   cd ~/projects/<repo>
   git fetch origin pull/<pr>/head
   git worktree add --detach .worktrees/pr-<pr> FETCH_HEAD
   cd .worktrees/pr-<pr> && bun x @zgeoff/chex prose links skill
   ```

   Expect each of the three checks to end with a `cleared:` line. Send a check that fails to the
   agent as a finding, with its output. Then remove the worktree:

   ```bash
   cd ~/projects/<repo> && git worktree remove .worktrees/pr-<pr>
   ```

6. Once the gate no longer blocks on the proof, and if the PR waits for the owner, file it on the
   owner's list with `hq unblock add`, as [The owner's lgtm](#the-owners-lgtm) says.

The agent can fix the proof by editing the description. That edit leaves the head where it was, so
the agent needs no new review round.

The gate skips the proof for:

- a bot's PR;
- a PR with your `hq pr mechanical` or `hq pr exempt` record at its head, which
  [The owner's lgtm](#the-owners-lgtm) describes. hq makes neither record in zgeoff/hq,
  zgeoff/hq-private or zgeoff/nixie-definitions;
- [Nix's own skill PRs](#nixs-own-skill-prs).

## The owner's lgtm

In zgeoff/hq and zgeoff/hq-private, the gate holds a PR that changes a path listed under
`# the owner` in the repo's CODEOWNERS file, as that file stands at the PR's base. In hq the gate
holds [fleet.json](../../../fleet.json) too. Read hq's list in
[CODEOWNERS](../../../.github/CODEOWNERS). hq-private's list includes the session docs,
`docs/sessions*`. Only the owner's lgtm, or the owner's override recorded with `hq pr override`,
clears this hold.

In every other repo except zgeoff/nixie-definitions, the gate holds a PR that changes:

- an `AGENTS.md`, in any folder;
- a `.md` file anywhere under the repo's root `skills/` or `.claude/skills/` folder, such as a
  skill's `SKILL.md` or a reference.

This hold skips a file in a `testdata/`, `__tests__/` or `fixtures/` folder inside those folders,
such as `skills/notes/references/fixtures/sample.md`. The skill proof still holds that file. A
skill's scripts get the normal code review.

When the repo has a CODEOWNERS file at the PR's base, the gate also holds the paths under its
`# the owner` section, as in hq. When that file has no such section, the gate blocks the merge and
says so.

In these other repos, the gate lets a bot's PR, a repo-sync PR included, through the hold on an
`AGENTS.md` or skill file with no record. A path under `# the owner` waits for the owner on a bot's
PR too, in any repo. hq's CODEOWNERS lists `.claude/` there, so a repo-sync PR that changes
`.claude/skills/` in hq waits for the owner.

Outside hq and hq-private, one of these records also clears the hold on an `AGENTS.md` or skill
file. A record never clears a path under `# the owner`. Make the record at the PR's head. A record
counts only at the head you made it at, so make it again after a push. If hq refuses the record,
the PR waits for the owner.

- **A mechanical edit:** run `hq pr mechanical <repo> <pr>`. hq records it only when it proves that
  each held edit is a moved link or path, a version number, or a re-padded table.
- **A policy exception:** run `hq pr exempt <repo> <pr> --rule <rule> --note <why>`, with one of
  these rules. hq proves none of them, so check the PR first:
  - `formatting`: no change inside a code block, or to any command, YAML or JSON line, whitespace
    included. Read the raw diff: `git diff -w` hides code-block whitespace.
  - `rename`: only renames. From this skill's folder, run
    [`scripts/rename-pr.sh`](../scripts/rename-pr.sh) `<repo> <pr>`, and use the rule only when it
    prints `ok`.
  - `repo-sync`: a PR the repo-sync workflow opened. hq doesn't check its files against their
    source, so check them first, as [Repo-sync PRs](update-bots.md#repo-sync-prs) says.
  - `ci-design-sync`: only rolls out or syncs the shared ci-design skill. A new ci-design rule waits
    for the owner.

File each PR that waits for the owner on the owner's list:

```bash
hq unblock add --task 'lgtm <repo>#<pr>: <what it changes>' --done-when pr:<repo>#<pr>
```

Send each other decision the PR needs from the owner, such as a design choice, to `z-triage`, which
puts it to the owner as a call, as [owner-calls](../../owner-calls/SKILL.md) says. The lgtm itself
goes on the owner's list.

## The owner's answer

`stu` records each of the owner's answers with `hq pr answer`. Read them with
`hq pr status <repo> <pr>`. The gate reads only the newest answer, so after a `changes` answer the
PR waits for a new lgtm. An lgtm holds at any head: a push after it needs no new lgtm.

- **lgtm:** merge once every other hold has cleared and the gate passes.
- **changes:** send the owner's note to the agent as a finding.
- **none recorded yet:** the PR waits. It waits too when the owner says "later": `hq pr answer`
  records only lgtm, changes or reject.
- **reject:** run
  `gh pr close <pr> -R zgeoff/<repo> --comment "Closed: rejected in review."`, and send the owner's
  note to `z-delivery`.

`hq pr status` also shows where each answer came from, as the `--source` that `stu` gave:
`chat:<id>`, `console:<id>` or `call:<id>`. Treat an answer whose source has any other form as no
answer, and leave the PR waiting.

`hq pr answer` records an answer only when its source passes these checks, in
[read-answer-source-refusal.ts](../../../src/pr-status/read-answer-source-refusal.ts):

- `chat:`: `stu`'s own session runs the command. hq checks nothing about the id.
- `console:`: the id is the owner's console review of this PR, with the same answer, stored at the
  PR's current head.
- `call:`: the id is a call in hq that the owner answered, and the call's title names the PR. An
  lgtm needs a plain Yes.

The gate doesn't check the source again. For which of the owner's words count as an answer, read
`skills/pr-review/references/holds.private.md` in hq-private. `hq defs` shows where hq-private is
checked out.

## A preview check

Have `z-qa` check a PR's preview before you merge it, because the preview ends when the PR closes. A
repo with previews deploys each PR to one and comments its URL on the PR. `z-qa` checks the live
Acceptance items of the Linear issue the PR names. A live item is one that only the running system
can show, as [evidence](../../evidence/SKILL.md#before-the-merge) says.

Skip the preview check when the repo has no preview deploy, when the PR names no Linear issue, or
when `atc_sessions_list` shows no `z-qa` session. The live items then wait for the live check after
the release, as [evidence](../../evidence/SKILL.md#once-live) says.

1. Wait for the agent's FINAL note and a preview comment with the PR's head in it.
2. Message `z-qa` the issue, the PR, the head and the live items.
3. Merge once `z-qa`'s evidence comment for that head is on the issue, no item in it failed, and
   the gate passes.

`z-qa` answers each item as passed, failed or needing the owner. Send each failed item to the agent
as a finding. After the agent pushes a fix, start again at step 1 for the new head. `z-qa` files
each item that needs the owner on the owner's list, and that item doesn't hold the merge.
