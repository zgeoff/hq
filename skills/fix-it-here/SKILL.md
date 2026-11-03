---
name: fix-it-here
description:
  When a review finding or a defect met during the work may stay unfixed, when an answer to a
  finding holds, and how to fix a finding well. Load it before you answer or judge an answer to a
  finding, let an agent leave something unfixed, or file an issue from a PR.
---

# Fix it here

Fix every finding, and every defect you meet while you do the work, in the PR at hand, whatever its
size. A filed issue costs a new agent and a new brief. A fix now costs minutes, with the context
fresh.

For each finding, you hand back one answer in the finding's thread: a fix with its commit, or one of
the answers below with its reason. When you judge another agent's answer, you hand back whether it
holds.

Watch for these:

- leaving a finding for a reason that doesn't hold, such as size or time;
- answering `not-a-defect` to a finding that is true but small;
- patching the same logic a third time.

For `z-review` and the fleet's other terms, see [owner-calls](../owner-calls/SKILL.md#terms).

## Key rules

- [Leave one unfixed](#leave-one-unfixed): only for a fix in another repo, or one that needs a
  choice the PR's Linear issue doesn't settle.
- [Answer a finding](#answer-a-finding): `fixed <sha>`, `not-a-defect`, `deferred GEO-<n>` or
  `accepted-risk`, each under its own condition.
- [Judge an answer](#judge-an-answer): reply in the thread, and leave it open when the answer fails.
- [Fix it well](#fix-it-well): find every break of the rule in one pass, and redesign logic you
  patched twice.

## Leave one unfixed

You may leave a finding unfixed for one of two reasons:

1. **The fix is in another repo.** Name a file path in that repo in your answer.
2. **The fix needs a choice that the PR's Linear issue doesn't settle.** Name the choice in your
   answer, such as a public interface, a schema, a config format, or behaviour that users or other
   sessions rely on. This reason doesn't hold when the issue already makes the choice. It also
   doesn't hold when the fix works the same whichever way the choice goes.

No other reason holds, including:

- size, time, or a round limit;
- another push or restack;
- a narrow brief, or a missing permission.

Fix a security defect in the PR, whatever the reason given.

For a reason that holds, answer in the finding's thread with the reason and the sections of a new
Linear issue for the finding: Outcome, Context (file, line, evidence), Scope and Acceptance. Leave
the thread open. `z-review` files that issue, and only `z-review` files one. It then replies
`deferred GEO-<n>` in the thread.

## Answer a finding

Reply in the finding's thread. Start with the answer, then give one line of reason.

- **`fixed <sha>`:** use it once you have pushed the fix. Name the commit that holds the fix as it
  stands at the PR's head, after any restack. The reviewer then confirms the fix at that head.
- **`not-a-defect`:** use it only when the finding is wrong about the code, or quotes a skill rule
  that doesn't apply. A true finding, however small, is a defect. When the finding quotes a rule
  from a shared skill, one that syncs into many repos, quote what shows the rule doesn't apply:
  - for [code-style](../../.claude/skills/code-style/SKILL.md) and
    [testing](../../.claude/skills/testing/SKILL.md), the shared skill's own words, because a
    repo's project skill can only add rules to these;
  - for [docs-writing](../../.claude/skills/docs-writing/SKILL.md), the shared skill's words or a
    line of the repo's project skill, because the project skill wins.
- **`deferred GEO-<n>`:** `z-review` posts it, for one of the two reasons above, once it has filed
  the issue.
- **`accepted-risk`:** use it only when the owner's answer is on record, as
  [owner-calls](../owner-calls/SKILL.md) says.

## Judge an answer

Judge another agent's answer by the conditions above, and reply in the finding's thread. When the
answer fails, give the file and line in 1 to 3 sentences, and tell the agent to fix it here. Leave
the thread open.

## Fix it well

- When a finding you fix cites a rule, re-read the rule. Search the whole diff for other breaks of
  that rule, and fix them all in one push.
- When you have patched the same logic twice, redesign it. Never patch it a third time. When the
  redesign needs a choice the PR's Linear issue doesn't settle, that is reason 2 above.
- When you fix a stacked PR, restack the PRs above it, and push them all together.
- Put a one-off script or codemod in the PR description, in a collapsed `<details>` block, never in
  a commit. A script that the repo runs again stays in the repo.
- Before a push, check every claim in the PR body against a test or the diff.

**Reply:** your answer to each finding, or whether each answer you judged holds.
