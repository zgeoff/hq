<!--
The standard delivery brief, for a Ready issue, a relaunch or a pitch. delivery-lead's
`references/briefs.md` says what each {{placeholder}} holds. Everything outside the placeholders reaches the
agent word for word.
-->

```text
/goal A ready PR in {{repo}} for {{issue_id}}, with evidence for each acceptance item and the review answered{{goal_file}}

{{issue}}

Permissions:
{{permissions}}

{{stack}}
Finish line: a PR in {{repo}}, out of draft with CI green, whose description holds "{{fixes}} {{issue_id}}" and evidence for each acceptance item. Keep the ID out of the title and branch. Before your FINAL note, review the whole diff once with `codex review -c model_reasoning_effort=medium --base main`, or a separate Opus review agent if Codex is unavailable or takes over 15 minutes, fix what it finds, and rerun the PR's tests.

In this PR, fix every review finding and every defect you meet in this repo, tests and CI included, whatever its size. A failing or flaky test or hook counts. Don't search the repo for defects. Leave one unfixed only when the fix belongs in another repo or needs a choice the issue doesn't settle, such as a public interface, schema, config format or behaviour users or other sessions rely on. Then send a `decision` note at once with the defect and your reason, and go on. List each in your final reply, after the FINAL note, with its reason, file, line and one sentence of evidence.
When a finding cites a rule, re-read the rule and fix every break of it in the PR diff in one push. Redesign logic you patched twice when a reviewer asks. Before you push, check each PR-body claim against a test or the diff. {{review_lines}} Put a codemod or mechanical script and its command in a collapsed `<details>` block in the PR body, not a commit. Keep my name out of commits, PRs and repo files. Invent examples, tests and fixtures, never from my messages, memories or people I know. Leave the Linear issue's state and the merge to me.{{not_yours}}
{{imp_line}}
Keep scratch files in a git-ignored folder in your checkout, such as `.scratch/`. Point Read, Edit and Write only inside your checkout. When done, stop your dev servers and daemons and remove your containers, temporary worktrees and scratch folder; keep your branch and unpushed work. Leave `BUN_INSTALL_CACHE_DIR` unset. Never make a folder in `/tmp`. Stop your own hung command with TaskStop, never `pkill`. Cap a one-off data command, such as awk, jq or a script: `(ulimit -v 4000000; timeout 600 <command>)`. Give `codex`, other agent CLIs, `oxfmt` and `oxlint` only a `timeout`, 900 for `codex review`: `ulimit -v` crashes them. If a note fails, put its text in your final reply.

Send an ATC note when you open the PR (`progress`), when it is final (`progress`, starting `FINAL <repo>#<n> <head sha>`), when you need a call (`decision`), and when an action is refused or a failure outside this repo stops you (`blocked`, with the exact text). Run every hook and step; never skip one with `--no-verify`, a `LEFTHOOK*` variable or a local lefthook config.
```
