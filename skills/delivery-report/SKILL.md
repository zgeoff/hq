---
name: delivery-report
description:
  Reports the code delivered across the owner's zgeoff repos over a day or a week, as the Linear
  issues that merged PRs worked on, grouped by project. Use when the owner asks for a daily or
  weekly report, or asks what shipped or what got delivered today, yesterday, or this week.
---

# Delivery report

Report to the owner the Linear issues that merged PRs worked on over a day or a
week. Report issues, not PRs: an issue names an outcome the owner recognises. The report lists
each issue with links to its PRs, and shows line counts only in a weekly report's totals line.
Leave decisions and approvals out. The owner sees those as they come. You are done when the
report is in a secret gist and you have sent its link with the totals line: the bold line that
`render-report.sh` prints first, with the PR, repo, issue and closed counts.

Avoid these traps:

- Work the period out from the calendar, never from saved state.
- Save each Linear result to a file unchanged. A copy you retype drops entries.
- Never rank PRs or days by lines. Generated code and data inflate the counts.

For the fleet's terms, such as `z-stu` or a grant, see [owner-calls](../owner-calls/SKILL.md#terms).

## Key rules

- [The period](#the-period): a Sydney calendar day or week, worked out from the calendar each time.
- [Gather the PRs](#gather-the-prs): run `merged-prs.sh`, and report what its JSON flags.
- [Look up the issues](#look-up-the-issues): save every Linear result to a file unchanged, and check
  its count.
- [Render the report](#render-the-report): run `render-report.sh`, then write the headline above
  the list and the closing lines below it.
- [Send it](#send-it): a secret gist, sent only to the owner; an update replaces the same gist.

## The period

Work the period out from the calendar each time, with the UTC offset in force on those dates. Never
take it from saved state or an earlier report.

- **A day** is a Sydney calendar day.
- **A week** runs Monday to Sunday, Sydney time.

## Gather the PRs

Run [`merged-prs.sh`](scripts/merged-prs.sh) with `daily` or `weekly` and a `YYYY-MM-DD` date, such
as `merged-prs.sh daily 2026-03-14`. It needs `gh`, `jq` and GNU `date`.

- Pass the date of the day you report on, such as yesterday's Sydney date for "what shipped
  yesterday". With no date, the script reports today. For a week, pass any day in it.
- Pass `--until <time>` only to end today's report at a time, such as the moment the owner asked.
- The script counts PRs authored by `zgeoff`. It keeps zgeoff/hq's PRs out of every count, and
  lists them only under the `workflow` key. hq is the z- sessions' own tool.

In the JSON it prints:

- `start`, `end`, `prs`, `byIssue` and `workflow` give the bounds, the PRs, each issue's PRs, and
  hq's PRs.
- When `searchCount` differs from `fetched`, a search page went missing. `render-report.sh` prints
  a line for it. Keep that line in the report.
- A PR with `approximate: true` had more than 100 files, so its line counts are too low. When the
  report gives its line counts, put "~" before each.

The line counts skip lockfiles, snapshots, generated files and eval data:

- When a PR's files, from `gh pr view <url> --json files`, show eval data the script's `evalData`
  map misses, say so in the report. Add those paths to the map in a PR.
- When fixtures or other generated code make up most of a PR's lines, say so wherever the report
  gives that PR's lines.
- Never rank PRs or days by lines.

## Look up the issues

Use the Linear tools. Save each page of results to its own file as it arrives, unchanged: a JSON
array, or an object with an `issues` array. Then count the issues in the file, and check that it
matches the number of issues in the tool's reply. When they differ, save the page again. Never
retype a result. A hand copy drops entries.

1. List team GEO's issues updated since `start`, 250 a page, and follow the cursor to the last page.
   Ask for id, title, url, status, statusType, project, priority and labels.
2. For each project those issues belong to, list all its issues with only id, statusType and
   project. The script draws each project's burndown from them.

## Render the report

Run [`render-report.sh`](scripts/render-report.sh) with the files in this order:

```bash
render-report.sh <merged-prs file> <issue page>... --projects <project page>...
```

The script sets the layout and names any issue it couldn't find. Leave `--json` off: hq's Shipped
tab uses it to get the report as data.

Above the script's output, write the headline: a `#` title on what the period mostly delivered,
then 3 or 4 bullets. Start each bullet with an emoji and a bold sentence on what moved and why it
matters. Name work by what it does, with no issue IDs.

For a daily report, put `## What changed in our workflow` between the headline and the script's
output:

- Write 2 to 4 bullets on how the agents' way of working changed, such as skills, review gates,
  `hq` commands, grants and session roles. Say what each change means for the work.
- Draw them from `workflow`, the skill PRs in `prs`, and the `hq news` items whose date falls in the
  period. Get those with `hq news --all --limit 2000 --json`, saved to a file.
- Leave the section out on a day with no changes. End it with a `---` rule.

Below the script's output, add:

1. One line with the number of open `zgeoff` PRs, as the PRs that wait on the owner. Get it with
   `gh api -X GET search/issues -f q='owner:zgeoff author:zgeoff is:pr is:open' --jq .total_count`.
   `gh search prs` stops at 30 results.
2. For a daily report, a `**Releases and deploys**` list:
   - Take it from the period's `DEPLOY` and `HOLD` lines in `~/.local/share/z-sessions/release.md`
     and the dated archives beside it, plus the `hq news` items on `release` or `deploy`.
   - Give one line each, in Sydney time: what shipped and its version, where, and the result:
     shipped, held with a short reason, or rolled back.
   - Put holds and failures first. Leave out commands, SHAs and raw log lines.
3. The Linear notes: up to 4 lines at the end of the report. Report these, and leave them for
   `z-triage` to fix:
   - PRs with no issue;
   - issues with no project, type or priority;
   - a Triage queue larger than at the start of the period;
   - issues still open after their PRs merged;
   - an issue with many PRs.

## Send it

Save the report in your scratch folder as `delivery-report-<first day of the period>.md`, and
publish it with `gh gist create --desc "Delivery report: <period>" <file>`. Anyone with the link can
read a secret gist, so send the link only to the owner, with the totals line. Never delete a gist:
the owner deletes them.

When `z-stu` starts you as a subagent for its
[morning reports](../intake/references/morning-reports.md), your brief says so. Return the link and
the totals line to `z-stu` instead of sending them.

To update a report, run every step again for the same period, and replace the file with
`gh gist edit <id> -f <file> <file>`, so that the link stays the same. Never append to the old text.

**Reply:** the gist link and the totals line.
