# noslop check-in

How `intake` runs the daily noslop check-in.

A daily session cron job in your session runs it at 18:07 Sydney time. When `CronList` shows none, create it, and save its creation time in your state file; a recurring job expires after 7 days, so replace it once it is 6 days old.

Read the `noslop since=` mark in your state file, note the time now, and run `hq noslop report --since <the mark> --json`. With no mark yet, use 24 hours ago. Write the time you noted as the new mark only after the `hq news add` below succeeds, so a failed run or a restart loses no window.

From each PR entry in `reports`, sum:

- Reviews: `reviewsOk`, and `reviewsFailed`, the reviews that failed.
- Findings: `findings`, split by `bySeverity`, and by outcome: `answered`, and `openIDs`, the findings still open.

From `totals`, the churn:

- `prs`: PRs reviewed in the window.
- `roundsWithNew`: rounds that raised a new finding.
- `repeatClass`: findings that cite a rule an earlier finding on the same PR cited. The target is about 0. `classUnknown` counts rows too old to tell.
- `late`: `{n, of}`, findings after round 1 on lines unchanged since round 1. `lateUnknown` counts the old rows.
- `mainMerge`: findings on code the PR did not write. It should stay 0. `mergeUnknown` counts the old rows.

Each PR entry carries the same churn fields, and the text output prints them as one `churn:` line per PR.

Then count the `accepted-risk` answers without the owner's words. Each PR entry's `ref` reads `<repo>#<n>`. For each, list the answers given since the mark, in finding threads and as issue comments that start with a finding's id:

```sh
gh api repos/zgeoff/<repo>/pulls/<n>/comments --paginate --jq '.[] | select(.created_at >= "<the mark, UTC>") | select(.body | startswith("accepted-risk")) | .body'
gh api repos/zgeoff/<repo>/issues/<n>/comments --paginate --jq '.[] | select(.created_at >= "<the mark, UTC>") | select(.body | test("^[0-9a-f]{16} accepted-risk")) | .body'
```

Give the mark as `YYYY-MM-DDTHH:MM:SSZ` in UTC, since GitHub's `created_at` is UTC. Count each answer that cites none of the sources that show the owner's words. Which sources those are is in this file's private half: read `skills/intake/references/noslop-checkin.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill.

Flag each PR with `mainMerge` above 0, each PR with a failed review, and each PR with `repeatClass` above 0 that opened after 2026-10-19T05:00Z, when the delivery brief gained its rule to fix a whole class of finding in one push. Read a PR's `createdAt` with `gh pr view <n> -R zgeoff/<repo> --json createdAt`.

Post one `hq news add --topic report` line that holds the reviews and failed reviews, the findings by severity and by outcome, the churn totals, the count of `accepted-risk` answers without the owner's words, and the flagged PRs. For each PR with such an answer, also add it to the owner's list with `hq unblock add --task "<repo>#<n>: accepted-risk answer cites no word of the owner's"`.
