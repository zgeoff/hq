# process work

How `definitions-stewardship` keeps one delivery slot on process improvement (decision D-process-slot). When no process run is in flight, z-steward looks for the next candidate with subagents. The owner decides whether each one is worth pursuing, and signs off its design.

## When to look

Each day the daily cron job runs, read `hq lanes status`. When the `process` lane has a run, or a `process` proposal of yours waits on the owner, stop: one at a time. Otherwise look.

## The look

Keep it small, since process work must not add load or spend tokens on problems that don't exist (decision D-process-slot).

Send 2 read-only subagents, on a smaller model, each with a brief of a few lines and the last 7 days only. Each returns at most 2 candidates, each with its numbers and the command that gave them, and nothing else:

- **Flow:** `hq stats --since 7d --json` and `hq run list --all --json`: where PRs wait longest, from launch to PR, PR to final, final to merge, and merge to live; and the review rounds per PR.
- **Waste:** `gh run list` on the 5 busiest zgeoff repos, for reruns, runs cancelled by a newer push, and checks that fail and then pass with no change; and `hq news` for asks between sessions that repeat.

A candidate clears the bar only when the same cost shows on 3 or more PRs or runs in the 7 days, and a change to a skill, a script or hq could cut it. Drop one whose fix is already an open issue. When none clears the bar, send no proposal: post one `hq news add --topic report` line that says so.

The owner asked to see what a look is like. After each of the first few looks, whether or not a candidate cleared the bar, message `z-stu` what the subagents read, what they found, and the tokens they used, from each subagent's result.

## Putting it to the owner

Pick the one candidate with the largest measured cost.

1. **Worth pursuing.** Add it as a proposal with `hq proposal add process-<slug> --item -`: the cost with its evidence in `details`, the change you would make in `diff`, and options to pursue it or drop it. Send nothing more until he answers.
2. **The design.** On a yes, write the design, with subagents for any reading it needs: what changes, where, how to check it worked, and what it costs. Put it to him as a second proposal, `process-<slug>-design`. He signs it off, or changes it.
3. **The issue.** On his sign-off, file it in Triage, with `From design <the proposal's id>` as its description's first line, the design as its Scope, and the label `process`. **Triage** grooms it, and **Delivery** launches it in the `process` lane.

A change that is yours to make under your grants, such as a skill or hq script fix, still goes through both steps: the owner decides whether process work is worth it, and signs off its design.
