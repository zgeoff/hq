---
name: delivery-report
description:
  Reports the code delivered across the owner's zgeoff repos over a day or a week, as the Linear
  issues that merged PRs worked on, grouped by project. Use when the owner asks for a daily or
  weekly report, or asks what shipped or what got delivered today, yesterday, or this week.
---

# Delivery report

Write the owner a report on one Sydney day or week. List the Linear issues named by the PRs that
merged in it, grouped by project, each with links to its PRs. Report issues, not PRs: an issue
names an outcome the owner recognises.

You are done when the report is in a secret gist and you have sent its link with the totals line.
The totals line is the bold line that `render-report.sh` prints first. It counts the PRs, the repos,
the issues and how many of those issues are now closed. A weekly totals line also gives the lines
added and removed, the only line counts in the report.

Avoid these traps:

- Work the period out from the calendar. Never take it from a date in a state file or an earlier
  report: it goes stale without notice.
- Write each Linear reply to a file whole, and check its count. A copy you retype drops entries.
- Never rank PRs or days by lines. Generated code and data inflate the counts.

The z- sessions are the agents that run the owner's fleet. For their names, grants and the fleet's
other terms, see [owner-calls](../owner-calls/SKILL.md#terms).

## Key rules

- [The period](#the-period): a Sydney calendar day or week, worked out from the calendar each time.
- [Gather the PRs](#gather-the-prs): run `merged-prs.sh`; run it again after a missing search page,
  and mark line counts that are too low with "~".
- [Look up the issues](#look-up-the-issues): write every Linear reply to a file whole, and check
  its count.
- [Render the report](#render-the-report): run `render-report.sh`, then write the headline above
  the list and the closing lines below it.
- [Send it](#send-it): a secret gist, sent only to the owner; an update replaces the same gist.

## The period

- **A day** is a Sydney calendar day. Get yesterday's date with
  `TZ=Australia/Sydney date -d yesterday +%F`.
- **A week** runs Monday to Sunday, Sydney time.

## Gather the PRs

Save every file of this job in your scratch folder. Run
[`merged-prs.sh`](scripts/merged-prs.sh) from the hq checkout, `~/projects/hq`, with `daily` or
`weekly` and a Sydney date, and save its JSON:

```bash
skills/delivery-report/scripts/merged-prs.sh daily 2026-03-14 > <scratch folder>/merged-prs.json
```

It needs `gh`, `jq` and GNU `date`, and applies Sydney's UTC offset itself.

- Pass the date of the day you report on. With no date, the script reports today, or this week. For
  a week, pass any day in it.
- Pass `--until <time>` only to end today's report at a time, such as the moment the owner asked.
  Give a time GNU `date` reads, such as `2026-03-14T21:30Z`.
- The script counts PRs authored by `zgeoff`. It keeps zgeoff/hq's PRs out of every count, and
  lists them only under the `workflow` key. hq is the z- sessions' own tool.

In the JSON:

- `start`, `end`, `prs`, `byIssue` and `workflow` give the bounds, the PRs, each issue's PRs, and
  hq's PRs. Each PR in `prs` has `added` and `removed` line counts.
- When `searchCount` differs from `fetched`, a search page went missing. Run the script once more.
  When the counts still differ, `render-report.sh` prints a warning line about it. Leave that line
  in the report the owner reads.
- A PR with `approximate: true` had more than 100 files, so its line counts are too low.
  `render-report.sh` doesn't mark this. In a weekly report, add "~" by hand before the totals
  line's added and removed counts.

The line counts skip lockfiles, snapshots, generated files, and the eval data paths in the
`evalData` map in `merged-prs.sh`. For a weekly report, read the files of each PR whose `added` plus
`removed` is over 1,000, with `gh pr view <url> --json files`:

- When they show eval data the map misses, say so in a line under the totals line. After you send
  the report, add those paths to the map in an hq PR.
- When fixtures or other generated code make up most of the PR's lines, say so in that line too.

## Look up the issues

Use the Linear tools, and write each page to its own file in your scratch folder with the Write
tool, as soon as it arrives, as the reply's JSON whole. `render-report.sh` reads a JSON array of
issues, or an object with an `issues` array, so the reply needs no change. It reads each issue's
id, title, url, status, statusType, project, priority, labels and createdAt. Then count the issues
in the file with `jq`, and check that the count matches the issues in the reply.

1. List team GEO's issues updated since `start`, 250 a page, and follow the cursor to the last page.
2. Take the project of each issue in `byIssue` from those pages. For each such project, list all
   the project's issues the same way: one file per page, the cursor to the last page, and the same
   count check. The script draws each project's burndown from them.

When `render-report.sh` prints `Not found in Linear:` with issue IDs, get each one with the Linear
tools. Write them to another issue page as a JSON array, and run the script again.

## Render the report

Run [`render-report.sh`](scripts/render-report.sh) with the files in this order:

```bash
skills/delivery-report/scripts/render-report.sh <merged-prs file> <issue page>... --projects <project page>...
```

Keep the layout the script prints. Leave `--json` off: hq's Shipped tab uses it to get the report as
data.

Above the script's output, write the headline: a `#` title on what the period mostly delivered,
then 3 or 4 bullets. Start each bullet with an emoji and a bold sentence on what moved and why it
matters. Name work by what it does, with no issue IDs.

A weekly report has no workflow section and no releases list. For a daily report, put
`## What changed in our workflow` between the headline and the script's output:

- Write 2 to 4 bullets on how the agents' way of working changed, such as skills, review gates,
  `hq` commands, grants and session roles. Say what each change means for the work.
- Draw them from `workflow`, the PRs in `prs` whose files include a `skills/` path, and the
  `hq news` items whose date falls in the period. Get those with
  `hq news --all --limit 2000 --json`, saved to a file.
- Leave out the owner's own decisions and approvals, such as his answers to calls and his lgtms on
  PRs. He sees each one as it comes.
- Leave the section out on a day with no changes. End it with a `---` rule.

Below the script's output, add:

1. The line `Open PRs waiting on the owner: <n>`. Get `<n>` with
   `gh api -X GET search/issues -f q='owner:zgeoff author:zgeoff is:pr is:open' --jq .total_count`.
   `gh search prs` stops at 30 results.
2. For a daily report, a `**Releases and deploys**` list:
   - Take it from the period's `DEPLOY` and `HOLD` lines in `~/.local/share/z-sessions/release.md`
     and in `release-archive-<YYYY-MM>.md` beside it for the period's month, plus the `hq news`
     items with the topic `release` or `deploy`.
   - Give one line each, in Sydney time: what shipped and its version, where, and the result:
     shipped, held with a short reason, or rolled back.
   - Put holds and failures first. Leave out commands, SHAs and raw log lines.
3. A `**Linear notes**` list, for `z-triage` to fix when it reads the report. Check the issues in
   `byIssue`, and the Triage issues on the step 1 pages. Give one line for each kind below that you
   find, naming its issues or PRs:
   - PRs with no issue;
   - issues with no project, priority or type label, such as `Bug` or `Feature`;
   - issues created in the period that still sit in Triage;
   - issues still open after all their PRs merged;
   - an issue with 5 or more PRs.

## Send it

Save the report in your scratch folder as `delivery-report-<first day of the period>.md`, and
publish it with `gh gist create --desc "Delivery report: <period>" <file>`. For `<period>`, write
the date, such as `2026-03-14`, or `week of` and the Monday, such as `week of 2026-03-09`.

Anyone with the link can read a secret gist, so send the link only to the owner, with the totals
line, in your reply to his request. Never delete a gist: the owner deletes them.

When `z-stu` starts you as a subagent for its
[morning reports](../intake/references/morning-reports.md), your brief says so. Return the link and
the totals line to `z-stu` instead of sending them.

To update a report, run every step again for the same period. Find the gist's ID with
`gh gist list`, by its description. Replace the file with `gh gist edit <gist ID> -f <file> <file>`,
so that the link stays the same. Never append to the old text.

**Reply:** the gist link and the totals line.
