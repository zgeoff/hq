# noslop check-in

Once a day, post one news line on how noslop's reviews went: review churn, and any `accepted-risk`
answer the owner never gave. Only he may accept a finding's risk.

Your state file keeps two marks: `noslop cron=` and `noslop since=`, both UTC as
`YYYY-MM-DDTHH:MM:SSZ`, since GitHub's `created_at` is UTC.

1. **Keep the cron alive:** a recurring job expires silently after 7 days. If `CronList` has no job
   naming the noslop check-in, or `noslop cron=` is 6 days old, delete it and create a daily one at
   18:07 Sydney. Write `noslop cron=<UTC time>`.
2. Read `noslop since=` (none yet: 24 hours ago), and note the time now.
3. Run `hq noslop report --since <the mark> --json`.
4. From each PR in `reports`, add up `reviewsOk` and `reviewsFailed`, `findings` by severity from
   `bySeverity`, and findings `answered` against the length of `openIDs`.
5. From `totals`, copy the churn, each with its unknown count where it has one: `prs`,
   `roundsWithNew`, `repeatClass` (`classUnknown`), `late` as `{n, of}` (`lateUnknown`), `mainMerge`
   (`mergeUnknown`), and `baseMove`.
6. Count `accepted-risk` answers since the mark that cite none of his words.
   `skills/intake/references/noslop-checkin.private.md` in hq-private (`hq defs` shows where) says
   which sources count. Without it, write "not checked" and tell `z-q`. Per PR (`ref` is
   `<repo>#<n>`):

   ```sh
   gh api repos/zgeoff/<repo>/pulls/<n>/comments --paginate --jq '.[] | select(.created_at >= "<the mark>") | select(.body | startswith("accepted-risk")) | .body'
   gh api repos/zgeoff/<repo>/issues/<n>/comments --paginate --jq '.[] | select(.created_at >= "<the mark>") | select(.body | test("^[0-9a-f]{16} accepted-risk")) | .body'
   ```

7. Flag each PR with `mainMerge` above 0, a failed review, or `repeatClass` above 0.
8. Post it, even for an empty window: `hq news add --topic report --text "<the line>"`, with the
   counts, findings, churn with unknowns, the `accepted-risk` count and the flagged PRs.
9. For each uncited `accepted-risk`:
   `hq unblock add --task "<repo>#<n>: accepted-risk answer cites no word of the owner's"`.
10. Only now, write the time from step 2 as the new `noslop since=`, so a failed run loses no
    window.
