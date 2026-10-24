---
name: linear-triage
description:
  How z-triage keeps the owner's Linear workspace accurate - every open issue groomed to the ticket
  standard and moved to Ready as soon as it meets the criteria - acts on hq's daily alerts, and
  prepares the calls that put open questions to the owner. Load it for each loop run's pass and check,
  when a session asks you to check now, when hq sends an alert, or before you write or rewrite an
  issue.
---

# linear triage

You keep Linear accurate, so hq can launch from it, `z-stu` can put the right questions to the
owner, and reports built on it tell the truth. Your main output is Ready work: hq fills every free
slot from Ready, so an issue that meets the criteria and sits in Backlog is an empty slot. You change
issues freely within the rules below, and you never message the owner: anything that needs him gets
the `Needs Geoff` label and a comment, and your check turns it into a call.

Run `hq capabilities --require 0.82.0` at the start of a session and after a compaction, and message
`z-q` the output when it fails. Workspace `zgeoff`, team `GEO`.

## Key rules

- [Ready](#ready): an issue moves to Ready when it meets the criteria, and for no other reason.
- [A pass](#a-pass): fetch, audit, groom, complete, close and promote, flag, end.
- [Flagging](#flagging): flag only what blocks the issue's delivery and only the owner can decide.
- [Alerts from hq](#alerts-from-hq): bad filings, stale work, unopened references and idle slots
  each have a fixed response.
- [The check](#the-check): queue one call per question; never apply an answer yourself.

## References

- [tickets.md](references/tickets.md): the ticket standard, the Ready criteria and the Actions
  catalogue, before you write, rewrite or save an issue.
- [fields.md](references/fields.md): the field and stale rules, before you set or correct a field.
- [closing.md](references/closing.md): completion, obsolete Backlog issues and freeing blockers, in step 5.
- [overlap.md](references/overlap.md): comparing open issues, in step 6.
- [check.md](references/check.md): the check's checklist, each time it runs.

## Ready

An issue moves to Ready when every section is filled, every blocker is Done, and the work fits one
agent, as [tickets.md](references/tickets.md) says. Priority doesn't hold an issue back: a Low issue
reaches Ready like any other. Three rules keep an issue out:

- **`parked`:** the owner parked it. The label is how hq sees a park, so `hq lanes promotable` leaves the issue out. Only the owner decides a park, as [fields.md](references/fields.md) says.
- **vers:** the owner picks which vers issues reach Ready. Groom them, and leave them in Backlog.
- **An unplanned nixie slice:** a slice is planned with the owner into sub-issues first, as
  [fields.md](references/fields.md) says.

## A pass

A **full pass** covers every open issue, once a day. A **light pass** covers Triage and the issues
updated since your last pass; run it every other time. Both passes promote: step 5 runs on every
pass, so an issue that meets the criteria reaches Ready within one run, not the next full pass.

```text
- [ ] 1. Fetch the issues for this pass, and save every page
- [ ] 2. Run audit-issues.sh
- [ ] 3. Groom each Triage issue
- [ ] 4. Complete each incomplete issue
- [ ] 5. Close what is done or obsolete, free what it blocked, promote what is ready
- [ ] 6. Full pass: compare open issues with each other
- [ ] 7. Flag what only the owner can decide
- [ ] 8. Save the TRIAGE PASS line, delete your scratch files; send no message
```

1. **Fetch.** Note the UTC time: it is this pass's start. For a full pass, run
   `hq linear issues --team GEO --state Triage,Backlog,Ready,'In Progress','In Review' --out <scratch>/pages`.
   For a light pass, run it with `--state Triage` into one folder, then with every open state and
   `--updated-since <the time on your last "TRIAGE PASS at" line>` into another. Pass the
   `issues-N.json` files to the scripts as they are. When it fails, fetch the same states with the
   Linear connector, save every page in your scratch folder, and say so in the pass line.
2. **Audit.** Run `scripts/audit-issues.sh <page files>`. It prints JSON: `triage`, `incomplete`
   (open issues missing a field or a section), `stale` (stale candidates), and `counts`.
3. **Groom each Triage issue.** Read it in full. In one update where you can: set its type, size,
   priority, project and area label, and its relations; mark it Duplicate of an original you're
   sure of, after you copy any detail the original lacks; rewrite it to the ticket standard where
   the information exists, without changing its scope; then move it to Ready when it meets the
   criteria, and to Backlog otherwise.
4. **Complete each incomplete issue.** Set the missing fields from what the issue says. List its
   sub-issues with `parentId` before you size it. Bring its sections to the standard where the
   issue already holds the information: add `Code delivery` as the Action for a Bug, Feature,
   Improvement or Chore that lacks one, and record as a relation a blocker its text names. This is
   your work, never a question for the owner.
5. **Close, free and promote,** on a light pass as on a full one. Check completion and what each
   closed or merged blocker frees, as [closing.md](references/closing.md) says. On a full pass,
   also close the obsolete Backlog issues it names, and gather the unsure ones. Then run
   `hq lanes promotable`: it reads Backlog from Linear itself, so a light pass's smaller fetch
   misses nothing, and it lists each Backlog issue whose blockers are Done and whose sections are
   complete. Move each to Ready, with a comment that names the blocker that closed or the criteria
   it now meets.
6. **Compare,** on a full pass, as [overlap.md](references/overlap.md) says.
7. **Flag,** as below.
8. **End the pass without a message.** Save "TRIAGE PASS at <start time>" in
   `~/.local/share/z-sessions/triage.md`, with "full" after it for a full pass. Keep the notes file
   for the check.

Save each issue once, as `tickets.md` says under "saving an issue".

## Flagging

Flag only a question that blocks the issue's delivery and that only the owner can decide: a scope
change, a priority the table disagrees with, closing an issue as not planned, or a project an issue
needs that doesn't exist yet. Before you flag, state in one line what the issue delivers: a feature,
a fix, or a decision. Then read its comments: when one records his decision on the question, write it
into the sections, and don't flag. The private half says how to recognise one: read
`skills/linear-triage/SKILL.private.md` in the local hq-private clone (`hq defs` shows where it is)
and follow it as part of this skill.

To flag, give the issue `Needs Geoff` and a comment with the question, the options and your
recommendation, and write the question and a one-sentence recommendation into the check's notes
file, a JSON object from issue ID to `{"question", "recommendation"}` in your scratch folder.

- An issue that asks for the owner's approval before build waits in Backlog, flagged once, only when
  it touches what he keeps (deleting or rewriting the owner's data, anything that touches Nix's memory or identity, credentials, scope and naming, a new session, a priority, and a High or Urgent security change). Any other such issue goes to Ready
  when it meets the criteria, with the question flagged beside it. Which credentials are another
  session's, and so not his to answer, is in the private half.
- A doc change that only records behaviour an issue or a decision already settles belongs in the PR
  that built that behaviour: comment that, and groom it for delivery.
- An unreproduced one-off that hasn't recurred stays in Backlog with a comment; step 5 closes it
  after 14 days.

## Alerts from hq

hq messages you when one of the daily checks goes red. Each has one response:

- **A bad filing:** an issue that points at a PR but that `z-review` didn't file. Apply the reason
  test in `pr-review`'s follow-ups reference. When it holds, record it with
  `hq followup add GEO-<n> --from <repo>#<n>` and groom it. When it fails and the PR is still open,
  message `z-review` the issue and the PR, which sends it back to the agent, then close the issue as
  Canceled with a comment naming the PR. When the PR has merged, groom it as an ordinary issue.
- **Stale work:** an In Progress issue with no run and no session, or an open run for a closed
  issue. Move the issue to its true state, as [closing.md](references/closing.md) says, and run
  `hq run sweep` for the runs.
- **An unopened reference:** a reference that no session of its role opened in 7 days. File one
  issue in Triage: the reference, its role, and the rule it holds that should move into `SKILL.md`
  or be deleted.
- **Idle slots, cause `triage`:** Backlog holds focus work that `hq lanes promotable` lists. Run
  step 5 now.

## The check

Each loop run is a pass, then the check. A "check now" message from another session runs the check
alone, at once. The check gathers what waits on the owner, prepares one call for each, and queues
the calls in `hq` for `z-stu`. It never talks to the owner and never applies an answer. Follow the
checklist in [check.md](references/check.md) each time.

## Rules

- An issue's scope, closing it as not planned, and launching work are the owner's or delivery's
  calls, never yours.
- Close an issue as superseded only when you're sure other issues carry all its work: comment with
  links to them, set it Canceled, and post one line to `hq news`. When you're unsure, flag it.
- Write comments in plain words, one point each, since the check quotes them to the owner.
