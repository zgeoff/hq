---
name: delivery-report
description: Reports the code delivered across the owner's zgeoff repos over a day or a week, as the Linear issues that merged PRs worked on, grouped by project. Use when the owner asks for a daily or weekly report, or asks what shipped or what got delivered today, yesterday, or this week.
---

# delivery report

The owner asks for this report when he wants to see what got delivered. Send it when he asks, or when the morning reports are due, as `intake` says: a decision or approval reaches him as it comes up, so the report holds no recap of those.

## Key rules

- [The period](#the-period): a calendar day or a Monday-to-Sunday week, in Sydney time.
- [Sending it](#sending-it): a secret gist, its link to the owner only, and a fresh render for an
  update.

## The period

A report covers a calendar period in the owner's local time, Australia/Sydney: one day for the daily report, and Monday to Sunday for the weekly report.

The daily report groups the issues by project, with each project's burndown. The weekly report adds line counts, and PRs and issues per day.

Work the period out from the calendar each time, with the UTC offset in force on those dates. Never take the start from saved state, an earlier report, or a guess.

## Gathering the PRs

Run `scripts/merged-prs.sh daily` or `scripts/merged-prs.sh weekly`, with a date such as `2026-10-12` for a day or week other than the current one, and `--until <time>` to end the period early. It needs `gh`, `jq`, and GNU `date`. It lists every PR merged in the period in a zgeoff repo and authored by `zgeoff`, which leaves out bot PRs such as release PRs, since agents work under that login. It leaves zgeoff/hq out of every count and list but `workflow`: hq is the sessions' own tool, and the owner doesn't want its PRs in the report. It prints one JSON object:

- `start`, `end`: the period, with the UTC offset in force on each date.
- `searchCount`, `fetched`: these match when every page arrived. If they don't, say so in the report.
- `totals`, `byRepo`: PRs, issues, repos, and lines added and removed.
- `byIssue`: each Linear issue the PRs cite, with its repos, lines, and PRs, most PRs first.
- `noIssue`: the PRs that cite no issue.
- `prs`: each PR's repo, number, title, URL, Linear issue ID (`null` when none is found), lines `added` and `removed`, the `excludedFiles` left out of the count, and `approximate`.
- `workflow`: the zgeoff/hq PRs, with title, URL and merge time, for the workflow section below.

The line counts leave out lockfiles, snapshots, generated files, and the eval data in auto-mode and auto-mode-evals, since one dependency bump or eval run can add more lines than a week of real work. The script's `evalData` map holds the eval data paths per repo; add a repo there when its data starts to swamp its counts. A PR with more than 100 files is `approximate`, because only its first 100 files are checked: mark its numbers with "~". When a count is still dominated by something that isn't hand-written code, such as test fixtures, say so.

Lines are a sense of scale, not a measure of value. Never rank PRs or days by them.

## Looking up the issues

Fetch the issues in `byIssue` from Linear with their id, title, url, status, statusType, project, priority, and labels: list team GEO's issues updated since the period's start, 250 at a time, and save each page to a file. Follow the cursor until no page is left. A merged PR updates its issue, so the list covers them; the report names any it misses.

For each project those issues belong to, list all of the project's issues with only id, statusType, and project, and save each page to a file. These give each project its burndown.

Save each result to a file as it arrives, and never retype one: a hand-copied list drops entries without notice. When a result comes back in the reply, write it to a file in one step, unchanged, and check the file's issue count against the reply's before you render.

## Rendering the report

Run `scripts/render-report.sh <merged-prs JSON> <issue page>... --projects <project page>...`. It prints the report as markdown; with `--json` first, it prints the same report as data, for hq's Shipped tab. The report lists issues, not PRs: an issue names an outcome the owner recognises, and a busy day merges 100 PRs across about 50 issues.

- **Daily:** a totals line, then one group per Linear project, busiest first, with "No project" last. Each project's heading shows its burndown: issues done of all its issues, and how many sit in Triage. Each issue is one line, `✅ 🐛 ❗ [(GEO-n) title](issue URL) - [#n](PR URL), …`, with its state at the end when it isn't Done. The first marker shows ✅ closed, ❌ canceled or duplicate, or 🔄 open, so the closed-first order reads at a glance. The next marker shows the type (🐛 bug, ✨ feature, 🔧 improvement, 🧹 chore, 📐 design, 🔍 investigation, ▫️ none), and 🚨 or ❗ flags Urgent or High priority. Within a project, closed issues come first, then by type in that order, then by priority. The totals line is followed by the closed issues per type. A "No issue" group lists the PRs that cite none, one line each: `- <repo>: [title](PR URL)`.
- **Weekly:** a totals line with lines added and removed, for scale, PRs and issues per day, the closed issues by project with a PR count each, one line per project for issues still open, and the "No issue" PRs as a count per repo.

Above it, open with a headline in your own voice: a `#` title that names the period's story, then 3 or 4 bullets, each with an emoji and a bold lead sentence, on what moved and why it matters, such as a slice landing whole, a project's big step, or a problem worth his attention. Name work by what it does, with no issue IDs; the list below carries them. The rendered list is the evidence; the headline is the judgement only you can add, so make it worth reading.

For a daily report, follow it with a `## What changed in our workflow` section in the same shape: 2 to 4 short bullets, each with an emoji and a bold lead sentence, on how the fleet's way of working changed that day, broadly. Cover new or changed skills, review gates, `hq` commands, grants and session roles, and say what each changes for the work, not which file moved. Draw them from `workflow`, from the `hq news` items whose `added_at` falls between the period's `start` and `end` (`hq news --all --limit 2000 --json`, saved to a file), and from the skill PRs in `prs`. Leave the section out on a day with no such change. End the headline, or the workflow section when there is one, with a `---` rule.

Then add, below it:

1. One line: how many PRs wait on the owner's review or merge.
2. For a daily report, a `**Releases and deploys**` list, so the owner can review delivery's release calls. Read each `DEPLOY` and `HOLD` line within the period from the Log in `~/.local/share/z-sessions/delivery.md` and from `delivery-archive.md` beside it, and the release lines in `hq news`. Write one line per release or deploy, in Sydney time: what shipped, as the package or service and its version, where it went, and the result: shipped, held with its reason in one short clause, or rolled back. Put holds and failures first. Leave out commands, SHAs and check output. Never paste the raw Log lines, which the owner found unreadable.
3. Up to 4 lines of Linear notes, when the period shows them: PRs with no issue and where they are, issues with no project, type, or priority, issues piling up in Triage, issues still open though their PRs merged, and one issue with many PRs that may want slices. Report these, and leave the fixing to triage.

## Sending it

Save the report as `delivery-report-<date>.md` and publish it as a secret gist: `gh gist create --desc "Delivery report: <period>" <file>`. Send the owner the link with the totals line; for the morning reports, the link goes in the `hq news` line instead. When the owner asks to update a report, run the whole pipeline again for the same period, render it fresh, and replace the gist's file with `gh gist edit <id> -f <file> <file>`, so the link stays the same. Never append new PRs or issues to the old text: only a fresh render keeps the sort order. A secret gist is unlisted, not private: anyone with the link can read it, so send the link only to the owner. He deletes the gist once he has read it.
