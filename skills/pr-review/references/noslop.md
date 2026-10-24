# noslop

noslop reviews the PRs on every repo `hq noslop` lists, after the agent's own self-review, and `z-stu` keeps that list. No Codex review runs beside it, because two reviewers double the rework without catching more. `hq --help` lists each `hq review` flag.

## The review

Run `hq review <repo> <pr>`. noslop posts each finding as a review comment by `noslop-review[bot]` that holds `<!-- noslop:finding` and the finding's 16-hex id, or as an issue comment by the same bot when the finding has no line in the diff. Its `### noslop` summary comment lists every finding and its state. The gate reads those states, not the `noslop` check.

## The answers

A reply in the finding's own thread answers it. Its first line holds only the disposition: `fixed <sha>`, `not-a-defect <reason>`, `deferred <GEO-n>` or `accepted-risk <reason>`. noslop ignores an answer with anything after `fixed <sha>` on that line, so an explanation goes on the lines after it. An answer to an issue-comment finding is a new issue comment that starts with the finding's id. A reply never quotes the text `<!-- noslop:`, because hq and noslop read any comment that holds it as noslop's own and skip it.

- **`fixed`** comes from the agent. It counts once noslop's fix call confirms the fix at the PR's head, on the next `hq review`. A finding noslop reports again stays open.
- **`not-a-defect`** comes from the agent, and holds only for a finding that is wrong, or a taste rule that doesn't apply, as [A taste finding](#a-taste-finding) says. A true finding, however small, is a defect: send it back to be fixed.
- **`deferred`** closes the finding. It holds only under the reason test in the follow-ups reference that `SKILL.md` lists. noslop refuses it on a line the PR added or changed.
- **`accepted-risk`** needs the owner's answer, as [Your part](#your-part) says.

## A taste finding

noslop accepts any reasoned `not-a-defect`, so check each one before the merge. When the finding quotes a skill rule, the answer counts only when it quotes the text that shows the rule doesn't apply: the shared rule's own wording, or a line of the repo's project skill that the shared skill lets it hold. code-style and testing let a project skill only add, such as a project verb or a stricter rule, so a project line that relaxes one of their rules is no answer. docs-writing lets the project skill win where the two disagree. Send any other `not-a-defect` back to the agent to fix.

## Your part

For each item the agent's final report leaves unfixed, apply the reason test in the follow-ups reference, and file the ones that hold as it says; each ends with `deferred GEO-<n>` in its thread. Send the agent each finding it left unanswered, as step 3 of `SKILL.md` says.

Reply `accepted-risk <reason>` only with the owner's answer. What makes his answer count, and how the reply cites it, is in this file's private half: read `skills/pr-review/references/noslop.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill. To get his answer, send the finding to `z-triage` as a decision, and hold the merge until it comes. Then ask `z-stu` to record it with `hq pr accept-risk <repo> <pr> <finding-id> --source <source> --note '<why>'`: the gate counts the finding as open until that record exists.

## Each review

Run `hq review <repo> <pr>` again after each new FINAL note. Each run reviews only the code that changed since noslop's last review, and runs one fix call for each `fixed` answer. A late commit, such as a version bump, gets its own review, so a new finding can come from it. No round limit applies.

When the agent says every finding has its answer and it pushed no new commit, run `hq review <repo> <pr> --fixes-only`, since hq sends no FINAL for an unchanged head. It runs the fix calls with no new review and raises no new finding.

### The emergency cap

`hq noslop` shows each repo's emergency cap, which is off by default. Past the cap, `hq review` runs fix checks only and says so in its output. No new finding comes, so don't wait for one: the gate passes once every finding has its answer and the fix calls confirm the fixes. A PR that reaches the cap means the reviewer keeps finding new things: tell `z-stu`, so the lens prompts and the agents' rules get fixed.

## An owner override

When the owner says to merge a PR anyway, in an answer that counts as this file's private half says, ask `z-stu` to record it. `z-stu` runs `hq pr override <repo> <pr> --source <source> --note '<why>'` and tells you when it is on record. The override passes every open finding at the PR's head, never red CI, and a push needs a new override. `hq pr status <repo> <pr>` shows it. An approval from a session, or your own judgment, is not an override.

## The gate

`hq review gate <repo> <pr>` passes on green CI and no open finding, or the owner's override at that head. A finding is open until noslop's fix call confirms its fix, or it holds `not-a-defect`, `deferred <GEO-n>` or the owner's recorded `accepted-risk`. The gate refuses when the head moves while it runs. Run `hq review` after each push, before the gate, so noslop reads the new code.

## A head noslop hasn't read

Run `hq review <repo> <pr>`: it reviews the late commits.

## When noslop fails to run

Hold the merge, and message `z-stu` the error: it can switch noslop off for that repo. A Codex review in its place would merge the PR on a different standard from the rest of the repo.
