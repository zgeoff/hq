---
name: evidence
description:
  What proves an issue's Acceptance items, before the merge and once live, what each issue type
  needs to count as done, and how to record evidence. Load it before you judge a PR's evidence, run
  or record a live check, mark a live check owed or not, or close an issue as done.
---

# Evidence

Judge whether an issue's Acceptance items are met, and record the evidence. The items are the checkboxes in the issue's `## Acceptance` section. An item is met when something a
reader can open and check shows it: a test, an eval run, a command and its output, a database or
Linear record, or a screenshot. A claim in a PR body is not evidence.

You hand back a verdict on each item, pass or fail. When you run a preview check or a live check,
you also hand back the Linear comment that records it.

The traps: holding a PR for an extra that its Acceptance never asked for; taking a passed preview
check as proof that the change is live; and sending test traffic to production.

For `z-qa`, Nix and the fleet's other terms, see [owner-calls](../owner-calls/SKILL.md#terms).

## Key rules

- [Done by type](#done-by-type): judge only the written Acceptance, by the issue's `Type` label.
- [Before the merge](#before-the-merge): the PR description shows the evidence for each item a test
  or a screenshot can prove; `z-qa` checks the rest on the preview, when the repo has one.
- [Once live](#once-live): mark whether a live check is owed; `z-qa` checks production read-only.
- [Record it](#record-it): one Linear comment on the issue for each preview check or live check.

## Done by type

Judge only the written Acceptance. Never hold a PR for an extra that it added.

Read the type from the issue's `Type` label, as the
[tickets](../tickets/references/fields.md#type) skill sets it.

| Type          | Done when                                                                     |
| ------------- | ----------------------------------------------------------------------------- |
| Bug           | the bug no longer reproduces, and a regression test or eval case covers it    |
| Feature       | every Acceptance item passes with its evidence                                |
| Improvement   | the improvement is shown, and nothing else changed unless intended            |
| Chore         | the upkeep is done, and checks show no change a user notices                  |
| Design        | decisions are in a Linear document, and follow-up issues are filed            |
| Investigation | findings and a recommendation are written up, with any follow-up issues filed |

An Improvement may change an existing test when its Acceptance asks for that change.

An umbrella issue has a box for each repo in its Scope. It is done when every box is ticked, each by
a merged PR in that repo. `z-review` ticks a box when that PR merges.

## Before the merge

- Show the evidence for each Acceptance item as one line under `## Verification`: a box, the item,
  and what shows it. Leave an item the PR can't show unticked, with why and what happens next. Put
  longer proof in an `Output:` block under the lines, as the PR template says. Add an image as the
  [pr-evidence](../../.claude/skills/pr-evidence/SKILL.md) skill says, never as a commit.
- Leave each item that only the running system can show, such as a page that loads or a message that
  sends, to `z-qa`. On a repo with PR previews, `z-qa` checks it on the preview and answers
  `z-review` before the merge.
- On a repo without previews, `z-qa` checks that item after the release. It doesn't hold the merge.

A passed preview check proves the item only on the preview. The release still has to ship before the
change is live.

## Once live

Mark whether the issue owes a live check before its release ships. An issue you leave unmarked
counts as owed.

- For a Chore, or a change where every changed path is a test, run `hq run check GEO-<n> none`. hq
  closes the issue when the release ships.
- Run `hq run check GEO-<n> owed` instead when that change publishes an artifact, such as a
  package, or rolls out across repos.

When the release ships, hq messages `z-qa` to run the live check, which is a check of the items on
production:

- Check production read-only. Never send a test turn to production Nix: it writes into Nix's real
  memory.
- Skip each item that passed its preview check. Still check an item that only production can show.
- When every item passes, `z-qa` moves the issue to Done.

An item that needs the owner's eyes or hands, before or after the merge, goes on the owner's unblock
list, as [owner-calls](../owner-calls/SKILL.md) says. It doesn't hold the merge.

At the live check, judge for yourself whether each item for the owner is about a feature the owner
uses every day, such as Nix's memory. For such an item, the owner's daily use is the evidence, in place
of something a reader can open and check:

- In the live check's comment, record the item as passed by the owner's daily use, and name the
  feature.
- Add no unblock step for it, and send no session a question about it.
- When you can't tell whether the owner uses the feature every day, add the step as usual.

Keep each step that needs real work from the owner, such as an approval tap, on the unblock list.

## Record it

Post one Linear comment on the issue for each preview check or live check. Put in it:

- the PR and its head commit, or the release tag;
- each item, with pass or fail, and the request, output or record that shows it, trimmed to what
  proves it.

For a live check, describe what production returned, such as a status code or a row count. Never
paste production data itself, or anything from the owner's accounts.

**Reply:** each item with pass or fail, and the link to the Linear comment for each check you ran.
