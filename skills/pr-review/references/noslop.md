# noslop

noslop reviews the PRs on every repo `hq noslop` lists, after the agent's own self-review, and `z-stu` keeps that list. No Codex review runs beside it, because two reviewers double the rework without catching more. `hq --help` lists each `hq review` flag.

## The review

Run `hq review <repo> <pr>`. noslop posts each finding as a review comment by `noslop-review[bot]` that holds `<!-- noslop:finding` and the finding's 16-hex id, or as an issue comment by the same bot when the finding has no line in the diff. Its `### noslop` summary comment lists every finding and its state. The `noslop` check passes only when every finding has an answer, and it changes only when `hq review` runs again, never when someone replies.

## The answers

A reply in the finding's own thread answers it. Its first line holds only the disposition: `fixed <sha>`, `not-a-defect <reason>`, `deferred <GEO-n>` or `accepted-risk <reason>`. noslop ignores an answer with anything after `fixed <sha>` on that line, so an explanation goes on the lines after it. An answer to an issue-comment finding is a new issue comment that starts with the finding's id. A reply never quotes the text `<!-- noslop:`, because hq and noslop read any comment that holds it as noslop's own and skip it.

- **`fixed`** comes from the agent. It counts when that commit changes a file of the PR and the next review no longer reports the finding.
- **`not-a-defect`** comes from the agent, and holds only for a finding that is wrong, or a taste rule that doesn't apply, as [A taste finding](#a-taste-finding) says. A true finding, however small, is a defect: send it back to be fixed.
- **`deferred`** holds only under the reason test in the follow-ups reference that `SKILL.md` lists. noslop refuses it on a line the PR added or changed.
- **`accepted-risk`** needs the owner's answer, as [Your part](#your-part) says.

## A taste finding

noslop accepts any reasoned `not-a-defect`, so check each one before the merge. When the finding quotes a skill rule, the answer counts only when it quotes the text that shows the rule doesn't apply: the shared rule's own wording, or a line of the repo's project skill that the shared skill lets it hold. code-style and testing let a project skill only add, such as a project verb or a stricter rule, so a project line that relaxes one of their rules is no answer. docs-writing lets the project skill win where the two disagree. Send any other `not-a-defect` back to the agent to fix.

## Your part

For each item the agent's final report leaves unfixed, apply the reason test in the follow-ups reference, and file the ones that hold as it says; each ends with `deferred GEO-<n>` in its thread. Send the agent each finding it left unanswered, as step 3 of `SKILL.md` says.

Reply `accepted-risk <reason>` only with the owner's answer. What makes his answer count, and how the reply cites it, is in this file's private half: read `skills/pr-review/references/noslop.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill. To get his answer, send the finding to `z-triage` as a decision, and hold the merge until it comes. Then ask `z-stu` to record it with `hq pr accept-risk <repo> <pr> <finding-id> --source <source> --note '<why>'`: the gate counts the finding as open until that record exists.

## Rounds

Run `hq review <repo> <pr>` again after each new FINAL note: it reviews the commits since the last round and checks the answers. noslop gives a PR 1 round when it is a sync, release or docs-only PR or its first review routed light, and 2 rounds otherwise. Past the cap, `hq review` refuses with `round_cap`. The only round past the cap is the `--redesign` round that `SKILL.md` describes.

### Fixes after the last round

A fix pushed after the last round counts only once a review reads it, so run `hq review <repo> <pr> --fixes-only` before the gate. It checks each fix answered since the last round and reports it fixed or not fixed. It raises no new finding and is not a round, so the cap doesn't stop it. Answer a fix it reports as not fixed by fixing it again.

`--fixes-only` refuses with `fixes_only_no_fix`, and names the commits, unless each commit since the last round is named by a `fixed <sha>` answer or is a merge of the PR's base branch. Code that no answer names and no round read doesn't merge in this PR, and that includes a fix spread over several commits. The agent moves that code to a new PR at once, under the same issue with "Contributes to", where it gets its own first round, or drops it. The same goes for code from a merge of any branch other than the base.

When a merge of the base has conflict resolutions, noslop checks each one in the `--fixes-only` run. When it judges one not sound, `hq review --fixes-only` refuses with "noslop judged the conflict resolution of a merge not sound": send the agent each finding noslop raised on it, to answer like any other finding.

`--fixes-only` needs an earlier round that read a head the branch still holds. After a rebase, hq maps the reviewed commits onto the new branch by patch id, and refuses when the rebase changed, dropped or reordered a reviewed commit, or when the rebased branch holds a merge.

### An unchanged head

When the agent says every finding has its answer and it pushed no new commit, run `hq review check <repo> <pr>`, since hq sends no FINAL for an unchanged head. It always exits 0: read the `conclusion` field of its JSON, `success` or `failure`, and its list of the findings still open.

## An owner override

When the owner says to merge a PR anyway, in an answer that counts as this file's private half says, ask `z-stu` to record it. `z-stu` runs `hq pr override <repo> <pr> --source <source> --note '<why>'` and tells you when it is on record. The override passes every open finding at the PR's head, never red CI, and a push needs a new override. `hq pr status <repo> <pr>` shows it. An approval from a session, or your own judgment, is not an override.

## The gate

`hq review gate <repo> <pr>` passes on green CI, a completed noslop review of the PR on record, and no open finding at the head, or the owner's override at that head. An accepted risk is not open. The gate refuses when the head moves while it runs. It doesn't check that a review read the head, so run `hq review` or `--fixes-only` after each push before you run the gate.

## A head noslop hasn't read

Run `hq review <repo> <pr>` first: it checks the late commits as its own round. Send the PR to `z-stu` under its noslop gap rule only when the round cap stops a new review, and you have read the fixes by hand and found them right.

## When noslop fails to run

Hold the merge, and message `z-stu` the error: it can switch noslop off for that repo. A Codex review in its place would merge the PR on a different standard from the rest of the repo.
