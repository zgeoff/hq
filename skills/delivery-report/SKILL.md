---
name: delivery-report
description:
  Reports the code delivered across the owner's zgeoff repos over a day or a week, as the Linear
  issues that merged PRs worked on, grouped by project. Use when the owner asks for a daily or
  weekly report, or asks what shipped or what got delivered today, yesterday, or this week.
---

# Delivery report

The report shows the owner the Linear issues that merged PRs worked on. Issues, not PRs: an issue
names an outcome he recognises. Leave decisions and approvals out; he sees those as they come.

## The period

A Sydney calendar day, or Monday to Sunday for a week. Work it out from the calendar each time, with
the UTC offset in force on those dates; never from saved state or an earlier report.

## Gathering the PRs

Run `scripts/merged-prs.sh daily|weekly [YYYY-MM-DD] [--until <time>]` (needs `gh`, `jq` and GNU
`date`). It counts PRs authored by `zgeoff`, and lists zgeoff/hq's only under `workflow`. In its
JSON:

- `searchCount` differs from `fetched`: a search page went missing; say so in the Linear notes.
- A PR marked `approximate` had over 100 files: mark its numbers "~".
- `start`, `end`, `prs` and `byIssue` give the bounds, the PRs, and each issue's PRs.

Line counts skip lockfiles, snapshots, generated files and eval data. If eval data still swamps a
repo, say so and add its paths to the script's `evalData` map in a PR. Say when fixtures or other
non-hand-written code dominate a count. Never rank PRs or days by lines.

## Looking up the issues

Save every Linear result to a file as it arrives, unchanged (a JSON array or an object with an
`issues` array), and check its count against the reply. Never retype one: hand copies drop entries.

1. List team GEO's issues updated since `start`, 250 a page, following the cursor to the end, with
   id, title, url, status, statusType, project, priority and labels.
2. For each of their projects, list all its issues with only id, statusType and project, for the
   burndown.

## Rendering the report

Run `scripts/render-report.sh <merged-prs JSON> <issue page>... --projects <project page>...`
(`--json` first prints it as data for hq's Shipped tab). It owns the layout and names any issue it
couldn't find.

Above the list, write the headline: a `#` title naming the period's story, then 3 or 4 bullets, each
an emoji and a bold lead sentence on what moved and why it matters. Name work by what it does, with
no issue IDs.

For a daily report, follow it with `## What changed in our workflow`: 2 to 4 bullets on how the
agents' way of working changed (skills, review gates, `hq` commands, grants, session roles), saying
what each changes for the work. Draw from `workflow`, the skill PRs in `prs`, and `hq news` items
added in the period (`hq news --all --limit 2000 --json`, saved to a file). Leave it out on a day
with none. End with a `---` rule.

Below the list:

1. One line: how many open `zgeoff` PRs wait on him, from
   `gh search prs --author zgeoff --state open`.
2. Daily: a `**Releases and deploys**` list, from the period's `DEPLOY` and `HOLD` lines in
   `~/.local/share/z-sessions/release.md` and its archives, plus `hq news` items on `release` or
   `deploy`. One line each, Sydney time: what shipped and its version, where, and the result
   (shipped, held with a short reason, or rolled back). Holds and failures first. No commands, SHAs
   or raw log lines.
3. Up to 4 lines of Linear notes: PRs with no issue, issues with no project, type or priority, a
   growing Triage, issues open though their PRs merged, an issue with many PRs. Report only;
   `z-triage` fixes them.

## Sending it

Save it in your scratch folder as `delivery-report-<first day of the period>.md`, and publish it:
`gh gist create --desc "Delivery report: <period>" <file>`. A secret gist is readable by anyone with
the link, so send it only to the owner, with the totals line (the first bold line). For the morning
reports, hand it back to `intake`. He deletes gists himself.

To update a report, run everything again for the same period and replace the file with
`gh gist edit <id> -f <file> <file>`, so the link stays. Never append to the old text.

**Reply:** the gist link and the totals line.
