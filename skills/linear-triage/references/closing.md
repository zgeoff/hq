# Closing, freeing and promoting issues

Step 5 of a pass: close what is done or no longer worth doing, free what each close unblocks, and
promote what meets the [Ready criteria](../SKILL.md#ready). To flag, follow
[Flagging](../SKILL.md#flagging).

Contents: [Completion](#completion) · [Stalled In Progress issues](#stalled-in-progress-issues) ·
[Obsolete Backlog issues](#obsolete-backlog-issues) ·
[What a closed blocker frees](#what-a-closed-blocker-frees) ·
[Promoting Backlog issues](#promoting-backlog-issues)

## Completion

Check:

- each issue in step 2's `stale` list;
- each issue you read this pass;
- each In Review issue;
- each In Progress issue whose PRs all merged more than 24 hours ago.

Judge by the `evidence` skill. Take the first case that fits:

- **Done at merge:** a merged PR meets every Acceptance item and needs no deploy or live check, or
  the issue's own closing condition has happened. Close as Done, commenting the PR or the condition.
- **A deploy or live check may be due:** wait 24 hours after the last merge, while `z-release` ships
  and `z-qa` checks. Then run `scripts/release-deployed.sh <repo>#<n>…` with the latest merged PR in
  each repo. Close only when each shows `deployed: true` and every item has evidence, and comment
  the PRs, releases and versions it prints. Otherwise comment, once, which items remain and who owns
  each. `deployed: null` means not deployed.
- **Partial evidence,** or another issue may cover it without proof: flag it.
- **An unreproduced one-off** left in Backlog, after 14 days with no new comment or PR: close as
  Canceled, "Not reproduced". Don't flag it.

## Stalled In Progress issues

No movement on the agent or the PR in 3 days. Find the session with `atc_sessions_list` (its name
has the issue ID) and the PR with `gh search prs GEO-<n> --owner zgeoff`. Flag it: "Stalled: nothing
has moved since <date>. Recommend <keep, relaunch, or close>, because <reason>."

## Obsolete Backlog issues

On a full pass, check each stale Backlog issue, except vers feature work. Close it with the evidence
when one of these holds:

| Finding   | What happened                                     | Close as                | Evidence             |
| --------- | ------------------------------------------------- | ----------------------- | -------------------- |
| Overtaken | A decision record or a merged change made it moot | Canceled                | The record or the PR |
| Gone      | The code or files it names no longer exist        | Canceled                | The paths and commit |
| Covered   | A closed issue did its work                       | Duplicate of that issue | That issue           |
| Reversed  | A later decision reversed its premise             | Canceled                | The decision         |

When the evidence is partial or you're unsure, close nothing. Add the issue, the evidence and your
recommendation to the possibly-obsolete list in `~/.local/share/z-sessions/triage.md`. On the week's
first full pass, flag every issue on the list with this exact comment, so the check asks them as one
question: "Are these Backlog issues still worth doing?" Put the evidence in `notes.json`, not the
comment. Then empty the list.

## What a closed blocker frees

Take as blockers: each Done issue in this pass's pages, each issue you closed, and each issue whose
PRs all merged. Read the issues each one blocks.

Free nothing from a Done issue you didn't close until it shows evidence: a merged PR with
`Fixes GEO-<n>`, a completion comment, or a Design or Investigation record. With none, reopen it to
its previous state and comment why.

## Promoting Backlog issues

Check each Backlog issue in this pass's pages, each one freed above, and on a full pass every
Backlog issue. Move each that meets the criteria to Ready, with a comment naming the blocker that
closed or the criteria it meets. When only a section is missing and the issue's text holds what it
needs, write it first, as step 4 does.
