<!--
The standard delivery brief. hq renders it for each Ready issue it launches, and you use it for a
relaunch or a pitch launch. hq fills each {{placeholder}}; agent-delegation's briefs.md says what
each one holds. Everything outside the placeholders reaches the agent word for word.
-->

```text
/goal A ready PR in {{repo}} for {{issue_id}}, with evidence for each acceptance item and the review answered{{goal_file}}

{{issue}}

Permissions:
{{permissions}}
{{stack}}
Finish line: a ready PR in {{repo}} whose description holds the line "{{fixes}} {{issue_id}}", with the ID kept out of the title and branch, and shows evidence for each acceptance item. Before your FINAL note, review the whole PR diff once with `codex review -c model_reasoning_effort=medium --base main`, or a separate Opus review agent when Codex is unavailable or not done in 15 minutes, fix what it finds, and run the PR's tests again after the fixes.

Fix what you meet in this repo, in this PR, whatever its size: review findings, and every defect you meet while you do this work, in any file of the repo, tests and CI included. A filed issue costs a new agent and a new brief, while a fix now costs you minutes with the context fresh. Don't search the repo for defects; fix what you meet. A failing or flaky test or hook in this repo is one of those defects: fix it here.
Leave an item unfixed only when the fix belongs in another repo, or when it needs a choice the issue doesn't settle, such as a change to a public interface, a schema, a config format, or behaviour that users or other sessions rely on. When you want to leave one, send a `decision` note at once with the item and your reason, and carry on with the rest while you wait. In your final report, list each item left unfixed with its reason, its file and line, and one sentence of evidence.
For each finding you fix, re-read the rule it cites, search the whole PR diff for other breaks of it, and fix all of it in one push. When a reviewer tells you to redesign logic you patched twice, redesign it. When you fix a class on a stacked PR, sweep the PRs above it in the same pass. Before you push, check every claim in the PR body against a test or the diff. {{review_lines}} Leave the Linear issue's state and the merge to me. Put a codemod or other mechanical-change script, and the command that ran it, in a collapsed `<details>` block in the PR description rather than committing it. Keep my name out of commits, PRs and repo files, and invent examples, tests and fixtures: never my messages, memories, or names of people I know.{{not_yours}}
{{imp_line}}
Keep scratch files in a git-ignored folder inside your checkout, such as `.scratch/`, and point Read, Edit and Write only inside your checkout. Before you finish, stop the dev servers and daemons you started, remove your containers and temporary worktrees, and delete your scratch folder; keep your branch and anything not yet pushed. Use Bun's shared install cache, so leave `BUN_INSTALL_CACHE_DIR` unset and make no folder in `/tmp`. Stop your own hung command with TaskStop rather than `pkill`, which can kill other sessions' processes on this shared machine. Cap a one-off data command, such as awk, jq or a script: `(ulimit -v 4000000; timeout 600 <command>)`. Give `codex`, other agent CLIs and Node tools that use WebAssembly, such as `oxfmt` and `oxlint`, only the `timeout`, as `ulimit -v` crashes them. If a note fails, put its text in your final reply.

Send a note through your ATC note tool when you open the PR (label `progress`), when it is final (label `progress`, starting `FINAL <repo>#<n> <head sha>`), when you need a call (label `decision`), and when an action is refused or a failure outside this repo stops you (label `blocked`, with the exact text). Run every hook and hook step: skipping one with `--no-verify`, a `LEFTHOOK*` variable or a local lefthook config hides the failure it exists to catch.
```
