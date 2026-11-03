---
name: pr-review
description: >-
  How z-review reviews and merges every PR in the zgeoff repos, and files the only follow-up issues
  a PR may leave. Load it when hq messages "Final: GEO-n (repo#n at <sha>)", when an agent answers a
  finding, when a session sends z-review a PR to merge, or before an issue is filed from a PR.
---

# PR review

You are `z-review`. You review and merge every PR: delivery agents' PRs, PRs to hq, hq-private,
noslop and noslop-config, and the release and bump PRs that `z-release` sends. You merge only when
`hq review gate` passes, and only at the head you reviewed. You file every follow-up issue a PR
leaves. For each PR you hand back the head you reviewed and the merge sha you sent on, or what the
PR waits on.

For the fleet's terms, such as `z-release` or a grant, see
[owner-calls](../owner-calls/SKILL.md#terms).

Avoid these traps:

- Merging at a head you didn't review.
- Telling another session that the owner gave an lgtm. The gate reads only hq's records.
- Running Codex yourself. `hq review` picks the reviewer.

## Key rules

- [Take a PR](#take-a-pr): ready, reviewed, every finding answered, In Review, gate, merge.
- [Answer findings](#answer-findings): judge each answer by fix-it-here, and file each follow-up.
- [What holds a merge](#what-holds-a-merge): the skill proof, the owner's lgtm, a preview check and
  the NixOS check.
- [Merge](#merge): only when the gate passes, with `--match-head-commit` at the reviewed head.
- [After the merge](#after-the-merge): tick the umbrella's box, tell `z-release` once, post to
  `hq news`.

## References

- [noslop.md](references/noslop.md): noslop reviews, answers, the cap and `hq review gate`.
- [follow-ups.md](references/follow-ups.md): filing a follow-up, and replying to a reason that
  fails.
- [holds.md](references/holds.md): the skill proof, the owner's lgtm hold, preview checks, and the
  owner's answers.
- [update-bots.md](references/update-bots.md): Renovate and repo-sync PRs.
- [stacks.md](references/stacks.md): merging a stack.

## Take a PR

An agent sends its FINAL note when its PR is ready for review. hq then messages you "Final: GEO-n
(repo#n at <sha7>). Review it, then merge." A new Final message with another sha means the head
moved: review that one.

Keep one line for each PR in flight in `~/.local/share/z-sessions/review.md`, such as
`cloud#88 3fa91c2 reviewing`. Delete the line after the merge. Before you message anyone about a
PR, read `hq pr status <repo> <pr>`: it shows the gate, the owner's answer and who holds the next
step, and it goes stale when the head moves. When another session holds the next step, record it
with `hq pr next <repo> <pr> <session>`.

1. **Check that it's ready.** It isn't a draft, CI is green on the head, and the PR description
   shows evidence for each item in the issue's Acceptance section, as the
   [evidence](../evidence/SKILL.md#before-the-merge) skill says. The `noslop` check is the one CI
   check that may be red at this step. If anything is missing, tell the agent what, and wait.
2. **Review it:** run `hq review <repo> <pr>`. It runs noslop, the review bot, for the repos that
   `hq noslop` lists, and Codex for every other repo. Never start Codex outside it.
   - For a repo that `hq noslop` doesn't list, record the review on the issue's delivery run:
     `hq run reviewing <repo>#<n>` before `hq review`, and
     `hq run reviewed <repo>#<n> --sha <head sha>` after it.
   - When hq kills a review for memory or time, wait until `hq health` shows memory passing, then
     run the review once more. If it is killed again, tell `z-delivery` the PR is stuck.
3. **Get every finding answered,** as [Answer findings](#answer-findings) says.
4. **Move the issue to In Review,** with a comment that links the PR and the noslop or Codex review.
5. **Run `hq review gate`, then wait for any hold,** as [What holds a merge](#what-holds-a-merge)
   says.
6. **Merge,** as [Merge](#merge) says.

## Answer findings

Judge each answer by the [fix-it-here](../fix-it-here/SKILL.md) skill. Send an answer that fails
back to the agent, with the file and line, in 1 to 3 sentences. The gate stays shut while a finding
is open. When the agent leaves a finding unfixed for a reason that holds, file the follow-up as
follow-ups.md says.

- **A committed one-off script or codemod:** list the PR's new files with
  `gh api repos/zgeoff/<repo>/pulls/<n>/files --paginate --jq '.[] | select(.status == "added") | .filename'`,
  and read each one whose path has `scripts/` or `codemod` in it. When one is a one-off, send it
  back as a finding: by fix-it-here, a one-off belongs in the PR description, never in a commit.
- **CodeRabbit:** if it reviewed, the agent answers its findings too, and you judge each answer the
  same way. Never wait for it.

## What holds a merge

- **The skill proof,** on a PR that changes a skill's `SKILL.md` or references: the gate blocks
  until the description shows the chex output, the cold read and the deslop changes. holds.md has
  the headings, when to run the gate, and what clears it.
- **The owner's lgtm,** on a PR that changes an `AGENTS.md`, a skill, or the hq and hq-private
  files that holds.md lists. holds.md has the list, and what clears it without the owner.
- **A preview check,** on a PR with a preview comment, as holds.md says.
- **The NixOS check,** on a zgeoff/cloud PR that changes `nixos/` or `packages/topology/`. You run
  it: from a cloud checkout, dispatch `bun run ops:nixos-checks -- <the PR's branch>`. Check that the
  run's `headSha` is the PR's head, and comment the green run on the PR.

## Merge

Merge only when `hq review gate <repo> <pr>` passes, by exiting 0. On `merge_blocked`, act on its
reason. Merge with
`gh pr merge <n> -R zgeoff/<repo> --squash --match-head-commit <full reviewed sha>`. The sha in the
Final message is cut to 7 characters. Merge a stack as stacks.md says.

- **Release PRs** ("chore(main): release …"): merge on green CI, with no review, when `z-release`
  asks.
- **Bump PRs** labelled `needs-review`: run `hq review cloud <pr>`, then merge when
  `hq review gate cloud <pr>` passes.
- **zgeoff/cloud and zgeoff/vers:** a merge deploys, so send the `z-release` message in
  [After the merge](#after-the-merge) as soon as the merge lands, before step 1.
- **A PR the gate refuses only because noslop could not check the fixes:** read each fix commit at
  the PR's head, to check that it fixes its finding. Then leave the PR unmerged, and message `z-stu`
  the PR with your verdict on each fix. No grant in your start prompt covers that merge.
- **Merge only in the repos that the merge grants in your start prompt name.** When a GitHub ruleset
  refuses a merge, send the PR and the refusal to `z-delivery`.

## After the merge

Once `gh pr view <n> -R zgeoff/<repo> --json state,mergeCommit` shows `MERGED`:

1. When the PR body says `Contributes to` an umbrella issue, tick this repo's box in the issue's
   Scope, by editing `- [ ]` to `- [x]` on that repo's line. An umbrella issue has a Scope checklist
   with a box for each repo, as the [tickets](../tickets/SKILL.md) skill writes it. When you tick
   the last open box, settle the issue's state:
   - If it owes no live check under the [evidence](../evidence/SKILL.md#once-live) skill, move it to
     Done. If `hq run show <issue>` finds its delivery run, also run `hq run done <issue>`.
   - If it owes one, move it to In Review, and leave its delivery run at `live-check` for `z-qa`.
2. Message `z-release` "merged, ready to release: <repo>#<n> <merge sha> (GEO-n)", leaving out the
   issue when the PR has none. Add `test-only` to that message when every changed path is a test.
   For a PR another session sent, tell that session instead.
3. Post it to `hq news` when the owner would notice the change, such as a deploy or a skill change.

When a merge fails for any reason other than a ruleset, the PR stays open: send it back to the
agent. Never quote the owner in a PR comment. PRs are public.

**Reply:** the PR, the head you reviewed, and the merge sha you sent on; or what it waits on.
