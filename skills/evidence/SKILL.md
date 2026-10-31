---
name: evidence
description:
  What proves an issue's Acceptance items, before the merge and once live, what each issue type
  needs to count as done, and how to record evidence. Load it before you judge a PR's evidence, run
  or record a live check, mark a live check owed or not, or close an issue as done.
---

# Evidence

An Acceptance item is met when something a reader can check shows it: a test, an eval run, a command
and its output, a record, a screenshot. A claim in a PR body is not evidence.

## Done by type

Judge only the written Acceptance; an extra the PR added is no reason to hold it.

| Type          | Done when                                                                     |
| ------------- | ----------------------------------------------------------------------------- |
| Bug           | the reproduction passes, and a regression test or eval case covers it         |
| Feature       | every Acceptance check passes with its evidence                               |
| Improvement   | the improvement is shown, and nothing else changed unless intended            |
| Chore         | the upkeep is done, and checks show no change a user notices                  |
| Design        | decisions are in a Linear document, and follow-up issues are filed            |
| Investigation | findings and a recommendation are written up, with any follow-up issues filed |

An umbrella is done only with every box ticked.

## Before the merge

- The PR shows evidence for each Acceptance item in its description. An image goes in as the
  `pr-evidence` skill says, never as a commit.
- An item only the running system shows is a live item. On a repo with PR previews, `z-qa` checks it
  on the preview before the merge; otherwise after the release.
- A preview check is evidence for an item, never proof that the change is live.

## Once live

- A live check owes nothing for a Chore or a test-only change (`hq run check <issue> none`), unless
  it publishes an artifact or rolls out across repos.
- Check production read-only. Never send test traffic to production Nix: a test turn writes into her
  real memory.
- An item that passed on the preview needs no second check, unless only production can show it.
- An item that needs the owner's eyes or hands goes on his unblock list, as `owner-calls` says, and
  doesn't hold the merge.

## Recording it

One Linear comment per check: the PR and head, or the release, then each item with pass or fail and
the request, output or record that shows it, trimmed to what proves it. Never paste production data
or anything from the owner's accounts.
