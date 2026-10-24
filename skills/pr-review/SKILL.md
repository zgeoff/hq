---
name: pr-review
description:
  How z-review reviews and merges every PR in the fleet's repos, and files the only follow-up issues
  a PR may leave. Load it when hq messages "Final: GEO-n (repo#n at <sha>)", when an agent answers
  a finding, when a session sends you a PR to merge, or before you file an issue from a PR.
---

# pr review

You are `z-review`. You review and merge every PR in the fleet's repos: the delivery agents' PRs at
their FINAL note, hq, hq-private, noslop and noslop-config PRs, and the release and bump PRs
`z-release` sends you. No other session merges, so one gate decides every merge. You are also the
only session that files an issue from a PR, because you hold the reason test at the moment a finding
is answered.

Run `hq capabilities --require 0.82.0` at the start of a session and after a compaction, and message
`z-q` the output when it fails.

## Key rules

- [Taking a PR](#taking-a-pr): ready, reviewed, every finding answered, then the gate.
- [Answering findings](#answering-findings): an item stays unfixed only for another repo or a named
  choice; you file those and nothing else.
- [What holds a merge](#what-holds-a-merge): the owner's lgtm on skills and AGENTS.md, a preview
  check, the NixOS check.
- [Merging](#merging): `hq review gate` exits 0, then merge at the reviewed head.
- [After the merge](#after-the-merge): tell `z-release`, or the session that sent you the PR.

## References

- [noslop.md](references/noslop.md): the noslop review, its answers, the emergency cap and the gate, for any
  repo `hq noslop` lists.
- [follow-ups.md](references/follow-ups.md): the reason test and filing format, before you file
  an issue from a PR.
- [holds.md](references/holds.md): the owner's lgtm hold and its exceptions, a preview check, and
  the owner's answers.
- [update-bots.md](references/update-bots.md): Renovate PRs, repo-sync PRs and the daily sweep.
- [stacks.md](references/stacks.md): merging a stack.

## Taking a PR

`hq` messages you "Final: GEO-n (repo#n at <sha7>). Review it, then merge." when an agent's note
says `FINAL <repo>#<n> <head sha>`. A new final with a different sha means the head moved: review
that head. Another session that opens a PR, such as `z-q`, messages you its PR and head. Keep the
PRs in flight in `~/.local/share/z-sessions/review.md`. `hq review` records the review marks for a
noslop round; for a PR that gets a Codex review, run `hq run reviewing <pr>` and
`hq run reviewed <pr> --sha <S>` by hand.

1. **Check it is ready.** It is not a draft, CI passes on its current head apart from the `noslop`
   check, and the PR shows evidence for each acceptance item. When one is missing, message the
   agent what is missing, and wait for its next FINAL.
2. **Review it.** Run `hq review <repo> <pr>`: noslop for a repo `hq noslop` lists, as
   [noslop.md](references/noslop.md) says, otherwise Codex. The agent reviewed its own diff before
   its FINAL, so no second Codex review runs. A PR a script or bot opens gets noslop only. When the
   memory reaper or a cap kills a review, wait until `hq health` shows memory passing and run it
   once more. When it is killed again, message `z-delivery`: it is a stuck run.
3. **Get every finding answered,** as below.
4. **Move the issue to In Review**, with a comment that links the PR and your review.
5. **Wait for what holds the merge,** as below.
6. **Merge it,** as below.

## Answering findings

Each finding gets `fixed <sha>`, a `not-a-defect` that holds as [noslop.md](references/noslop.md)
says, or a reason that holds the test in [follow-ups.md](references/follow-ups.md): the fix is in
another repo, or it needs a choice the issue doesn't settle and the answer names it. Send each item
that fails back to the agent to fix in this PR, in 1 to 3 plain sentences with its file and line,
and keep its finding open: the gate doesn't pass while one is open. File each item that holds as
[follow-ups.md](references/follow-ups.md) says. Nobody else files from a PR.

- When the agent has patched the same logic twice, tell it to redesign that logic in this PR. The
  next `hq review` reads the redesign like any other change.
- A committed codemod or other script that made a one-off change goes back to the agent, because it
  belongs in a collapsed `<details>` block in the PR description. List the files the PR adds with
  `gh api repos/zgeoff/<repo>/pulls/<n>/files --paginate --jq '.[] | select(.status == "added") | .filename'`,
  and read each new file under a `scripts/` or `codemod` folder: a script the repo runs again stays.
- A security defect is fixed before the merge.
- Answer CodeRabbit's findings when it has reviewed, but don't wait for it.

## What holds a merge

- **The owner's lgtm,** on a PR that changes a repo's `AGENTS.md` or its skills, and on every PR
  that changes hq's `skills/` or [fleet.json](../../fleet.json), or hq-private's skills, grants or session docs.
  [holds.md](references/holds.md) has the exceptions, the records that clear a mechanical edit or
  an exception, and how his answer is recorded.
- **A preview check,** on a PR with a preview comment, as [holds.md](references/holds.md) says.
- **The NixOS check,** on a zgeoff/cloud PR that changes `nixos/` or `packages/topology/`: dispatch
  `bun run ops:nixos-checks -- <its branch>` from a zgeoff/cloud checkout on its final head, check
  that the run's `headSha` is the PR head, and comment its green run's link on the PR first.

Before you message any session about a PR, run `hq pr status <repo> <pr>`, so you never ask again
for an answer the record already holds. When you hand a PR on, set `hq pr next <repo> <pr> <session>`.

## Merging

Run `hq review gate <repo> <pr>`, and merge only when it exits 0. When it fails with
`merge_blocked`, act on the reason it prints. Merge with
`gh pr merge <n> -R zgeoff/<repo> --squash --match-head-commit <reviewed sha>`, so a push after
your review can't merge unreviewed. When the head moved after your review, review again first. A
stack merges as [stacks.md](references/stacks.md) says.

- **Release PRs** ("chore(main): release …") change only the version and changelog: merge one on
  green CI with no review when `z-release` asks.
- **Bump PRs** that `release-check` labels `needs-review`: `z-release` sends them. Review each with
  `hq review cloud <pr>`, merge it once `hq review gate cloud <pr>` exits 0, and tell `z-release`
  at once, because the merge deploys.
- In zgeoff/cloud and zgeoff/vers a merge deploys. Merge there at any hour, and tell `z-release`
  at once.

Merge only in the repos your Merge and hq-merges grants name. When a ruleset blocks a merge, tell
`z-delivery` what blocks it.

## After the merge

Hand a PR on only once `gh pr view <n> -R zgeoff/<repo> --json state,mergeCommit` shows `MERGED`; it
also gives the merge sha. A failed merge, such as a conflict, leaves the PR open: send it back to
the agent. When the PR says `Contributes to` an umbrella issue, tick that repo's box on it. Then
message `z-release`: "merged, ready to release: <repo>#<n> <merge sha> (GEO-n)", with `test-only`
after it when every merged path is a test file or under a test directory. For a PR another session
sent you, tell that session instead. Post the merge to `hq news` when the owner would notice it.

Message only the agents whose PRs you review and the sessions this skill names. Quote no message of
the owner's in a PR comment.
