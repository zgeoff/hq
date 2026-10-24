# closing, freeing and promoting issues

Step 5 of a pass: close each issue whose work is done or no longer worth doing, free the issues its close unblocks, and promote each Backlog issue that meets the Ready criteria.

## completion

Check for completion each stale candidate, each issue you read in this pass, each In Review issue, and each In Progress issue whose every PR merged more than 24 hours ago, however recently it moved. An umbrella issue is complete only when every repo's box in its checklist is ticked.

- **Done at merge.** Close an issue as Done when a merged PR shows each acceptance item met and the change needs no deploy or live check, or when the condition the issue's own text sets for closing has happened. Comment the evidence: the PR, or the issue that met it.
- **A deploy or live check may be due.** Leave the issue to `z-release` and `z-qa` until every PR on it merged more than 24 hours ago. Then run `scripts/release-deployed.sh <repo>#<n>…` with the last PR in each repo the issue touched, and close it only when each PR shows `deployed: true` and every acceptance item has its evidence. Comment each PR, release and pinned version from the script's output. Otherwise comment once which items remain and who owns each, and leave it.
- **Partial evidence.** When the evidence covers only part of the acceptance, or another issue only probably covers it, flag it with your recommendation.
- **An unreproduced one-off.** One that step 7 left in Backlog turns stale after 14 days with nothing new: close it as not reproduced, with a comment, and don't flag it.

Judge only the written acceptance. An extra the PR adds beyond it, such as a test the acceptance never asked for, is no reason to flag. A preview check is evidence for an acceptance item, never that the change is live.

What counts as live differs by repo, and `release-deployed.sh` holds each rule. Two cases have no production pin: a merge in zgeoff/tools or zgeoff/noslop is live once a published release of each package it changes contains it, and an hq merge is live once the hq installed on this host was built from a commit that contains it. The script shows `deployed: null` for an hq built from source or from a dirty tree.

An In Progress issue is stale when neither its agent nor its PR moved in 3 days. Find the agent with `atc_sessions_list`, whose session names carry the issue ID, and the PR with `gh search prs GEO-<n> --owner zgeoff`. Give a stale one `Needs Geoff` and the comment "Stale: nothing has moved since <date>. Recommend <keep, relaunch, or close>, because <reason>."

## obsolete Backlog issues

On a full pass, check each Backlog issue in the audit's `stale` list, the ones untouched for 14 days or more, for whether its work is still worth doing. Leave out vers feature work, which only the owner decides. Close an issue as Canceled, or as Duplicate of the issue that covered it, when you find one of these, and comment the evidence:

- **Overtaken:** a decision record or a merged change made it moot. Name the record or the PR.
- **Gone:** the code or files it names no longer exist. Name the paths and the commit that removed them.
- **Covered:** a closed issue did its work. Name that issue.
- **Reversed:** a later decision reversed its premise. Link the decision.

When the evidence covers only part of an issue, or you are unsure, close nothing. Add the issue to the obsolescence list in `~/.local/share/z-sessions/triage.md`, with the evidence you found and your recommendation. On the first full pass of each week, flag every issue on that list with the same question, word for word: "Are these Backlog issues still worth doing?" The check then puts them to the owner as one call. Empty the list once you have flagged them.

## what a closed or merged blocker frees

For each issue in this pass's list that is Done, each you closed in this pass, and each whose every PR has merged, get it with its relations and read the issues it blocks. Free nothing from a Done issue you didn't close until its acceptance shows evidence: a merged PR that says `Fixes GEO-<n>`, a completion comment, or a Design's or Investigation's record. When it shows none, reopen it to its last state and comment why.

## promoting Backlog issues

Check against the Ready criteria, blockers aside, each Backlog issue in this pass's list or freed by a closed or merged blocker, and on a full pass every Backlog issue. Move each one that meets them to Ready, with a comment that names the blocker that closed or whose PRs merged, or the criteria it meets. When one fails only on a missing section whose information it holds, write the section as step 4 says, then move it.
