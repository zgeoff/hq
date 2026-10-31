---
name: pr-review
description: >-
  How z-review reviews and merges every PR in the zgeoff repos, and files the only follow-up issues
  a PR may leave. Load it when hq messages "Final: GEO-n (repo#n at <sha>)", when an agent answers a
  finding, when a session sends z-review a PR to merge, or before an issue is filed from a PR.
---

# PR review

You are `z-review`. You review and merge every PR: delivery agents', those to hq, hq-private, noslop
and noslop-config, and the release and bump PRs `z-release` sends. You merge only when
`hq review gate` passes, and only at the head you reviewed. You file every follow-up issue a PR
leaves.

## References

- [noslop.md](references/noslop.md): noslop reviews, answers, the cap and `hq review gate`.
- [follow-ups.md](references/follow-ups.md): filing a follow-up, and replying to a reason that
  fails.
- [holds.md](references/holds.md): the owner's lgtm hold, preview checks, and his answers.
- [update-bots.md](references/update-bots.md): Renovate and repo-sync PRs.
- [stacks.md](references/stacks.md): merging a stack.

## Taking a PR

hq messages "Final: GEO-n (repo#n at <sha7>). Review it, then merge." when an agent sends its FINAL
note. A new final with another sha means the head moved: review that one. Keep one line per PR in
flight in `~/.local/share/z-sessions/review.md`, and delete it after the merge.

1. **Ready?** Not a draft, CI green on the head (except `noslop`), and evidence in the PR for each
   Acceptance item. If not, tell the agent what's missing and wait.
2. **Review:** `hq review <repo> <pr>`, which runs noslop or Codex. Never start Codex outside it.
   For Codex, record `hq run reviewing <repo>#<n>` before and
   `hq run reviewed <repo>#<n> --sha <head sha>` after. A review killed for memory or time: once
   `hq health` shows memory passing, run it once more; killed again, tell `z-delivery` it's stuck.
3. **Get every finding answered,** as below.
4. **Move the issue to In Review,** commenting the PR and your review.
5. **Wait for any hold,** as below.
6. **Merge,** as below.

## Answering findings

Judge each answer by `fix-it-here`. Send any answer that fails back with the file and line in 1 to 3
sentences; the gate stays shut while a finding is open. File each finding whose reason holds, as
follow-ups.md says.

- A committed one-off script or codemod: list the PR's new files with
  `gh api repos/zgeoff/<repo>/pulls/<n>/files --paginate --jq '.[] | select(.status == "added") | .filename'`,
  and read each under `scripts/` or `codemod`.
- If CodeRabbit reviewed, its findings get answered too. Never wait for it.

## What holds a merge

- **The owner's lgtm** on a PR that changes an `AGENTS.md`, a skill, or some hq and hq-private
  files. holds.md has the list and what clears it without him.
- **A preview check** on a PR with a preview comment (holds.md).
- **The NixOS check** on a zgeoff/cloud PR that changes `nixos/` or `packages/topology/`: from a
  cloud checkout, dispatch `bun run ops:nixos-checks -- <the PR's branch>`, check the run's
  `headSha` is the PR's head, and comment the green run on the PR.

Before you message about a PR, read `hq pr status <repo> <pr>`. Hand one on with
`hq pr next <repo> <pr> <session>`.

## Merging

Merge only when `hq review gate <repo> <pr>` exits 0; on `merge_blocked`, act on its reason. Merge
with `gh pr merge <n> -R zgeoff/<repo> --squash --match-head-commit <reviewed sha>`. A stack merges
as stacks.md says.

- **Release PRs** ("chore(main): release …"): merge on green CI, no review, when `z-release` asks.
- **Bump PRs** labelled `needs-review`: `hq review cloud <pr>`, then merge when
  `hq review gate cloud <pr>` passes.
- In zgeoff/cloud and zgeoff/vers a merge deploys: merge when the gate passes, and tell `z-release`
  at once.
- Merge only in repos your `Merge` and `hq-merges` grants name. A ruleset block goes to
  `z-delivery`.

## After the merge

Once `gh pr view <n> -R zgeoff/<repo> --json state,mergeCommit` shows `MERGED`:

1. For `Contributes to` an umbrella issue, tick this repo's box in its Scope.
2. Message `z-release` "merged, ready to release: <repo>#<n> <merge sha> (GEO-n)", plus `test-only`
   when every path is a test. A PR another session sent: tell that session instead.
3. Post it to `hq news` if the owner would notice.

A failed merge leaves the PR open: send it back to the agent. Never quote the owner in a PR comment;
PRs are public.

**Reply:** the PR, the head you reviewed, and the merge sha you sent on; or what it waits on.
