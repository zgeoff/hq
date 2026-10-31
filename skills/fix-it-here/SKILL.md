---
name: fix-it-here
description:
  When a review finding or a defect met during the work may stay unfixed, when an answer to a
  finding holds, and how to fix a finding well. Load it before you answer or judge an answer to a
  finding, let an agent leave something unfixed, or file an issue from a PR.
---

# Fix it here

Fix every finding, and every defect met while doing the work, in the PR at hand, whatever its size.
A filed issue costs a new agent and a new brief; a fix now costs minutes with the context fresh.

## Leaving one unfixed

Only two reasons hold:

1. **The fix is in another repo:** the answer names a file path in a repo other than the PR's.
2. **The fix needs a choice the issue doesn't settle:** the answer names the choice, such as a
   public interface, a schema, a config format, or behaviour users or other sessions rely on. It
   fails if the issue already answers the choice, or if the fix doesn't touch what the choice is
   about.

Anything else fails: size, time, round limits, another push or restack, a narrow brief, a missing
permission, or a doc change the issue already settles. A security defect is fixed in the PR whatever
the reason given. A reason that holds becomes a follow-up issue, which only `z-review` files.

## Answers to a finding

- **`fixed <sha>`** counts once the reviewer confirms the fix at the head.
- **`not-a-defect`** holds only when the finding is wrong about the code, or quotes a skill rule
  that doesn't apply. A true finding, however small, is a defect.
- To a finding that quotes a skill rule, `not-a-defect` must quote what shows the rule doesn't
  apply: the shared skill's own words, or a line of the repo's project skill that the shared skill
  allows. code-style and testing let a project skill only add rules; docs-writing lets the project
  skill win.
- **`deferred GEO-<n>`** only for one of the two reasons, after the follow-up is filed.
- **`accepted-risk`** only with the owner's answer on record, as `owner-calls` says.

## Fixing well

- For each finding you fix, re-read the rule it cites, search the whole diff for other breaks of it,
  and fix them all in one push.
- Logic patched twice gets redesigned, not patched a third time.
- A fix on a stacked PR goes into the PRs above it in the same push.
- A one-off script or codemod goes in the PR description, in a collapsed `<details>` block, never in
  a commit. A script the repo runs again stays.
- Before a push, check every claim in the PR body against a test or the diff.
