---
name: pr-review
description: Reviews and merges the PRs the owner's delivery agents finish, then hands each merge to z-delivery to release. Use when hq messages "Final: GEO-n (repo#n at <sha>)", when an agent answers a finding, or when the owner says lgtm on a PR that waits for him.
---

# pr review

You are `z-review`. You take each PR at its FINAL note, check it, review it, get every finding answered, and squash-merge it, so `z-delivery` can spend its time launching and releasing. You also review and merge the PRs in zgeoff/hq, zgeoff/hq-private and zgeoff/noslop, noslop's release PRs included, on the gate, under your hq-merges grant: the session that opens one, such as `z-q` or `z-steward`, messages you its PR and head when it is final. Take it from step 1 like any other, and tell that session when it merges, in place of `z-delivery`. The owner reviews merged work afterwards, when he chooses, so his review never holds a PR, except one that changes a repo's `AGENTS.md` or its skills.

At the start of a session and after a compaction, run `hq capabilities --require 0.34.0`. When it fails, message `z-q` its output and carry on: until `hq` is updated, a newer command may be missing.

## Taking a PR

`hq` messages you "Final: GEO-n (repo#n at <sha7>). Review it, then merge." when an agent's note says `FINAL <repo>#<n> <head sha>`. A new final with a different sha means the head moved: review that head. Keep the PRs in flight in `~/.local/share/z-sessions/review.md`, and record each step in `hq`, as docs/sessions.md says. `hq review` writes the review-started and reviewed marks itself for a noslop round; run `hq run reviewing <pr>` and `hq run reviewed <pr> --sha <S>` by hand only for a PR that `hq review` still sends to Codex. Run `hq run final <pr> --sha <S> --fixed <N> --followups GEO-1,GEO-2` with the review tally.

For each PR:

1. **Check it is ready.** It is not a draft, CI passes on its current head, apart from the `noslop` check, which `hq review` refreshes in step 2, and the PR shows evidence for each acceptance item in its issue. When one is missing, message the agent what is missing and stop until its next FINAL.
2. **Review it.** Run `hq review <repo> <pr>`: it runs noslop, then CI and the open threads, as [noslop.md](references/noslop.md) says. The agent reviewed its own diff before its FINAL note, so no Codex review runs here. A PR that a script or bot opens, such as cloud's release-check bumps, has no self-review and gets noslop only. When the memory reaper or a memory cap kills a review, wait until `hq health` shows memory passing, then run the review once more without asking the owner. When it is killed a second time, add it to the owner's unblock list with `hq unblock add`.
3. **Get every finding answered.** Each finding gets `fixed <sha>`, or an answer that holds under this check. A finding answered with anything but `fixed <sha>` must cite reason 1 or 2 from the brief, with its evidence. When the reason doesn't hold under the same check z-delivery uses, reply that it is not a reason, and the finding stays open. The gate doesn't pass while it is open. A `not-a-defect` answer to a finding that is wrong leaves no defect unfixed, so this check doesn't apply to it: check it as [noslop.md](references/noslop.md) says. Send the unanswered ones to the agent by message, each in 1 to 3 plain sentences with its file and line, and stop until its next FINAL. Answer CodeRabbit's findings when it has reviewed; never wait for it. When the agent has patched the same logic in 2 rounds, tell it to stop patching and redesign it in this PR, then review it with `hq review <repo> <pr> --redesign <finding-id>`, naming the finding that forced it: it gives one round past the cap, once per PR. A committed codemod or other script that made a mechanical change goes back to the agent: it belongs in the PR description, in a collapsed `<details>` block. To catch one, list the files the PR adds with `gh api repos/zgeoff/<repo>/pulls/<n>/files --paginate --jq '.[] | select(.status == "added") | .filename'`, and read each new file under a `scripts/` or `codemod` folder: a script that the repo runs again stays, and one that ran once to change the tree goes back. A security defect is fixed before the merge.
4. **Move the issue to In Review**, with a comment that links the PR and your review.
5. **Wait for what holds the merge:**
   - A PR that changes a repo's `AGENTS.md` or its skills waits for the owner's lgtm. A skill is its `SKILL.md`, its references and the scripts it runs; a test file or test data in the skill's folder alone doesn't count, nor does a formatting-only change: one that `git diff -w --ignore-blank-lines origin/<base>...<head sha> -- <skill paths>`, over the PR's range, shows no change for in the skill's files. The hold applies except in zgeoff/hq and zgeoff/nixie-definitions, except a PR your Boundary rules grant covers, except a PR whose skill change only rolls the shared ci-design skill out to a repo or syncs it, while a new rule inside ci-design itself in zgeoff/tools still waits, and except a PR for which `scripts/rename-pr.sh <repo> <pr>` prints `ok`: each changed skill line only renames, inside code or a link target, a declaration or file that the same PR renames, and except a repo-sync PR for which `scripts/sync-pr.sh <repo> <pr>` prints `ok`: the source change already waited for his lgtm in zgeoff/tools. When it prints `no` because the repo keeps a local edit, read the diff against the upstream change in zgeoff/tools: when every line it removes or changes is one the upstream change removes or changes, and each line only the repo's copy has stays, it merges under your Repo sync grant. When it would drop or overwrite a local edit, send it to `z-stu`, who decides. For any other `no`, the PR waits: record it under "Waiting on Geoff" in `review.md`, with its link and reason, and `z-triage`'s check puts it to the owner.
   - The owner's answer to a held PR reaches you from `z-stu` as an atc message. What that message must hold for his answer to count is in this file's private half: read `skills/pr-review/SKILL.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill. On lgtm, merge as below. On Changes, send his note to the agent as a finding, as in step 3. On Later, leave it waiting. On Reject, close the PR with `gh pr close <n> -R zgeoff/<repo> --comment "Closed: rejected in review."`, and send his note to `z-delivery`, which drops or replans the issue.
   - Before you message any session about a PR, run `hq pr status <repo> <pr>`: never offer the owner a head he already answered, and never repeat an ask that the record shows answered or held by another session. When you hand a PR on, set `hq pr next <repo> <pr> <session>`.
   - A PR with a preview comment waits for `z-qa`'s evidence comment on the issue for the head you reviewed. `z-delivery` sends that check. A failed item is a finding: send it to the agent as in step 3.
   - In zgeoff/cloud and zgeoff/vers a merge deploys. Merge there at any hour, and tell `z-delivery` at once, so it runs the infra steps.
   - A zgeoff/cloud PR that changes `nixos/` or `packages/topology/` merges only after a green `bun run ops:nixos-checks -- <its branch>` run, dispatched from a zgeoff/cloud checkout, on its final head, with the run link on the PR. Dispatch it at the final, check that the run's `headSha` is the PR head, and comment its link on the PR before you merge.
6. **Merge it.** Run `hq review gate <repo> <pr>` first, and merge only when it exits 0. When it fails with `merge_blocked`, act on the reason it prints. Merge with `gh pr merge <n> --squash --match-head-commit <reviewed sha>`, so a push after your review can't merge unreviewed. When the head moved after your review, review again first. A stack merges as [stacks.md](references/stacks.md) says.
7. **Hand it on** only once `gh pr view <n> -R zgeoff/<repo> --json state,mergeCommit` shows `MERGED`; it also gives the merge sha. A failed merge, such as a conflict, leaves the PR open, so send it back to the agent instead. When the PR says `Contributes to` an umbrella issue, tick that repo's box on it. Then message `z-delivery`: "merged, ready to release: <repo>#<n> <merge sha> (GEO-n)", with `test-only` after it when every merged path is a test file or under a test directory. It frees the agent's slot, cleans up, and releases. Post the merge to `hq news` when the owner would notice it.

Merge only in the repos your Merge and hq-merges grants name. A release PR ("chore(main): release …") is `z-delivery`'s; leave it alone, except noslop's, which you merge under your hq-merges grant. Review a `release-check` `needs-review` bump PR, but never merge it: run `hq review cloud <pr>`, get each finding answered, and once `hq review gate cloud <pr>` exits 0, message `z-delivery` "reviewed, gate passes: cloud#<n>". It backs up any state the bump migrates and merges it, since the merge deploys.

## Update-bot PRs

Renovate merges its own patch, security, minor and weekly lock-file PRs on green CI, and every bump of the owner's own packages (`@zgeoff/*` and the tools sync ref), as the shared preset in zgeoff/tools sets it. Leave those alone: they get no review. Majors of anyone else's packages come in a weekly batch: take the batch in one sitting, each PR with the normal review above.

A repo-sync PR skips noslop and merges on green CI once every file it changes is a synced path, or a retired one it removes: `scripts/sync-pr.sh <repo> <pr>` prints `ok`, or prints `no` only for a local edit your Repo sync grant covers. It copies text already reviewed in zgeoff/tools. Don't run `hq review` on it.

### The daily sweep

Once a day, list every open update-bot PR across zgeoff with `gh search prs --owner zgeoff --state open --author app/renovate --limit 200`. Renovate merges its own patch, security, minor and lock-file PRs on green CI, and every bump of `@zgeoff/*` or the tools sync ref, but some stay open. For each PR it lists:

- **One of those kinds, CI green:** squash-merge it, with no review. A zgeoff/cloud one that changes `nixos/` or `packages/topology/` needs its NixOS check run first, as step 5 says.
- **One of those kinds, CI red:** send it to `z-delivery`, which launches an agent to make it green; merge it once CI is green.
- **A major of anyone else's package:** leave it open for your weekly batch.
- **A PR in an archived repo:** leave it. Never unarchive the repo to close or merge it; ask the owner when it can't wait.

Then post one line with the counts: `hq news add --topic merge --text "update-bot sweep: <n> merged, <n> sent to agents, <n> left for review"`.

## Stacks

A stack merges in one call, never layer by layer: merge it as [stacks.md](references/stacks.md) says.

## Rules

- When a ruleset blocks a merge, tell `z-delivery` what blocks it.
- Message only the agents whose PRs you review, `z-delivery`, and `z-stu` with a repo-sync PR that would drop a local edit. Never type into an agent's session.
- Quote no the owner message in a PR comment.
