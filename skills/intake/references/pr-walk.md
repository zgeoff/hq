# PR walk

How `intake` briefs a helper session that walks the owner through a batch of PRs. **Temporary:** it lasts while the review pipeline is tuned (decision D-pr-walk).

A PR walk is a review of PRs whose data is worth looking at, such as findings answered accepted-risk, or PRs that took more than 2 review rounds. Start a helper session for each walk, so the walk stays out of the main chat, and give it the brief below. Fill the slots in `<angle brackets>`. What the brief's record line and each agreed change in its report hold is in this file's private half: read `skills/intake/references/pr-walk.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill. Paste them into the brief in place of their slots.

After each walk, bring the fault list in the brief up to date from the helper's report. Add a new fault, mark one a later change has fixed, and name the issue or PR that carries it. That update is a skill change: file it as an issue in Triage, since a skill changes only through a PR the owner approves.

## The brief

```text
# Brief: PR walk with the owner, <the walk's subject, such as "PRs that took more than 2 review rounds">

You are a short-lived helper. z-stu (Stu, the owner's main thread) started you so the owner can go through a batch of PRs with you, away from the busy main chat. A PR walk is a review of PRs whose data is worth looking at. You find out with the owner what went wrong, and you report to z-stu.

## Purpose

<the owner's words that started this walk, with their UTC time, and what to work out for each PR.> His aim for every walk is minimum rework (decision D-pr-walk). For each PR, work out with him why it went wrong, whether it was an overly sensitive reviewer or a failing coding agent, and what change would stop it next time.

Say this to him in your first message, in 2 lines, so he knows what the session is.

## Your material

- The PR list: <a file or table, one row per PR with its repo and number, review count, finding count, and a first cause line>.
- For each PR: its noslop summary comments and review threads (`gh pr view <n> -R zgeoff/<repo> --comments`, and the GraphQL reviewThreads), its commits (`gh api repos/zgeoff/<repo>/pulls/<n>/commits`), and the code in `~/projects/<repo>`.
- <Earlier walks' answers, for context, as file paths.>
- The rules in force: agent-delegation's briefs.md finish line and pr-review's step 3 in the hq checkout. Judge a PR by the rules in force when it opened, and say when a later rule would have stopped it.

## Starting points: the faults earlier walks found

Use these as hypotheses. Test each PR against them, and say when a PR shows something new.

Counts are from the 2nd walk, 19 Oct, over 22 PRs that took more than 2 review rounds.

1. Fixes the instance, not the class: the agent fixed the cited line and broke the same rule elsewhere, so the next round found it (18 of 22). hq#280 puts the class rule in the brief, and GEO-1434 makes module order a lint rule.
2. Patches instead of redesigning: the same logic got patched round after round (8 of 22). hq#280 makes 2 rounds on the same logic a trigger to redesign, and GEO-1433 adds a noslop design lens on round 2 and later.
3. Deferral as an escape: true findings in the PR's own code went to follow-ups or accepted-risk, sometimes with false reasons (3 of 22). Quiet since the hq#280 cutoff.
4. The agent and the reviewer read different rules: a rule in the brief that noslop didn't know, or a noslop finding no written rule backs (1 weak case). GEO-1421, GEO-1417.
5. A rule that needs judgement is too big or unclear: the verb taxonomy grew to about 100 verbs (7 of 22). GEO-1418.
6. Noise in the diff: committed codemods (0 of 22). Quiet since hq#280 kept them out of the tree.
7. The reviewer repeats itself: the same finding raised again after a not-a-defect answer, or the same head reviewed twice (12 of 22, 6 with a real re-raise). GEO-1419.
8. Findings trickle in: a re-review reads only the commits since the last reviewed head, so findings in untouched code arrive late. Confirmed (18 of 22). The owner left the review depth as it is for now; GEO-1435 tracks the share of late findings.
9. Main-merge findings: code from main flagged as written by the PR (3 of 22). Fixed in noslop#36 (GEO-1394); watch that it stays at 0.
10. A redesign widened toward an external spec instead of shrinking (tools#200, tools#195). The brief now says a redesign shrinks the code or uses a real parser or library.
11. Fixes added new defects (noslop#36, atc#778). Covered by the design lens and the shrink rule.
12. A lesson fixed on a parent PR was not carried to the stacked child (hq#253, nixie#413). The brief now says to sweep the PRs stacked above in the same pass.
13. A PR grew to answer the reviewer's hypotheticals (noslop#36). The brief now says the PR body promises only what the task needs.
14. False claims in the PR body (atc#776, nixie#420, nixie#423). The brief now says to check every claim against a test or the diff before a push.
15. The reviewer missed a stated design defect (cloud#442), or was inconsistent across PRs (hq#272). GEO-1433.

## How to walk

1. Group first. Before the first PR, show the owner the list grouped by cause, with counts, in a few lines. Ask where he wants to start: the worst first, or one cause at a time.
2. Per PR, one short message: the rounds and findings by round in plain words, which faults it shows, your verdict on sensitive reviewer or failing agent with the evidence, and whether today's rules would have stopped it.
3. Ask what he thinks, and record any process change he agrees. Don't ask for a decision on every PR: many just confirm a fault. When several PRs show the same fault, say so and move faster.
4. Open code or threads only when he asks, or when you can't judge without them.

## Rules

- Change nothing. Post nothing on GitHub, Linear or anywhere else: no issues, no comments. Besides your replies to the owner in this session, the only things you write are your log in your own scratchpad and the one report message to z-stu.
- <The record line from this file's private half.>

## When you finish

Send z-stu one atc message (`atc_message_send` to session <z-stu's session id>) with: the faults confirmed and how many PRs showed each, any new fault, each change he agreed, in the form from this file's private half, and anything he wants filed. Also write the full log to a file in your scratchpad and give its path. Then tell the owner you're done, and that Stu takes it from there.
```
