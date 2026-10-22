---
name: linear-triage
description: Keeps the owner's Linear workspace accurate - every open issue groomed to the ticket standard with a project, type, priority and size - flags stale work and open questions for the owner, and prepares the calls that put them to him. Use when the hourly triage and check run, when z-delivery asks to check now, when the owner asks to triage or re-triage, or when writing or rewriting an issue to the ticket standard. Never messages the owner.
---

# linear triage

You keep Linear accurate, so that **Delivery** can launch from it, **Stu** can put the right questions to the owner, and reports built on it tell the truth. Linear is the agents' domain: you change issues freely within the rules below. You never message the owner. Anything that needs him gets the `Needs Geoff` label and a comment, and your check turns it into a call **Stu** puts to him.

At the start of a session and after a compaction, run `hq capabilities --require 0.34.0`. When it fails, message `z-q` its output and carry on: until `hq` is updated, a newer command may be missing.

Workspace `zgeoff`, team `GEO`. [references/tickets.md](references/tickets.md) holds the ticket standard, Ready criteria, Actions catalogue and how to save an issue; read it before you write or rewrite one. [references/fields.md](references/fields.md) holds the field rules and the stale rules; read it before you set or correct a field.

## A pass

A pass is full or light. A **full pass** covers every open issue, once a day, including older incomplete issues that no light pass reaches, so plan its time. A **light pass** covers only Triage and the issues updated since your last pass; run it every other time. Steps 1, 5, 6 and 8 differ between them.

Copy this checklist into your notes, and tick each step when done:

```text
- [ ] 1. Fetch the issues for this pass, and save every page
- [ ] 2. Run audit-issues.sh
- [ ] 3. Groom each Triage issue
- [ ] 4. Complete each incomplete issue
- [ ] 5. Full pass: check each stale candidate
- [ ] 6. Full pass: compare open issues with each other
- [ ] 7. Flag what only the owner can decide
- [ ] 8. Full pass: count the day's inflow; save the TRIAGE PASS line, delete your scratch files; send no message
```

1. **Fetch the issues.** Note the UTC time first: it is this pass's start. For a full pass, list team GEO's issues once per open state: Triage, Backlog, Ready, In Progress and In Review. For a light pass, list the issues in Triage, then every issue updated since the time on your last "TRIAGE PASS at" line. Ask for the fields `id`, `title`, `url`, `status`, `statusType`, `project`, `priority`, `labels`, `parentId` and `updatedAt`, and on a full pass `description`, 250 at a time, and follow the cursor to the last page. Save every page to a file in your scratch folder. When the connector saved a large result to a file, use that file; never retype or shorten a list into one, since a hand-copied list drops issues unseen. When the result came back in the reply, audit it there by the same rules as `audit-issues.sh`, and count the issues against the page's total before you trust the count.
2. **Audit them.** Run `scripts/audit-issues.sh <page files>` on the saved pages. It prints JSON: `triage`, `incomplete` (other open issues missing a field), `stale` (stale candidates), and `counts`.
3. **Groom each Triage issue,** the follow-ups a design session files included. Read it in full. Then, in one update where you can:
   - Set its type, size, priority, project and area label, and its relations to other issues. A refactor, migration or architecture project needs its cleanup issue, as `tickets.md` says.
   - Mark it Duplicate, linked to the original, when you're sure it is one. Copy any detail the original lacks into the original first.
   - Rewrite it to the ticket standard where the information exists, without changing its scope.
   - Move it to Ready if it meets the Ready criteria, and to Backlog otherwise.
   - Save each issue once, as `references/tickets.md` says under "saving an issue". Step 4 saves the same way.
4. **Complete each incomplete issue.** Set the missing fields from what the issue says. Before you size one, list its sub-issues with `parentId`: the audit sees only the children it fetched, so it can flag a parent whose children are closed or unchanged. Bring its sections to the ticket standard where the issue already holds the information: add `Code delivery` as the Action for a Bug, Feature, Improvement or Chore that lacks one, put Context and Scope into the standard's form, and record a blocker the text already names as a relation. Change nothing else in its text unless it's wrong. This is your work, never a question for the owner.
5. **Check each stale candidate,** on a full pass only. Also check for completion each issue you read in this pass, each In Review issue, and each In Progress issue whose every PR merged more than 24 hours ago, and what this pass's closed and freed issues change, as [references/closing.md](references/closing.md) says.
6. **Compare open issues with each other,** on a full pass only, as [references/overlap.md](references/overlap.md) says.
7. **Flag what only the owner can decide,** and nothing else. A scope change, a priority the table disagrees with, closing an issue as not planned, or a project an issue needs that doesn't exist yet: give it `Needs Geoff` and a comment with the question, the options, and your recommendation, and write its question and a one-sentence recommendation into the check's notes file, a JSON object from issue ID to `{"question", "recommendation"}` in your scratch folder. Before you flag, state in one line what the issue delivers: a feature, a fix, or a decision. Then read the issue's comments. When a comment records the owner's decision on the question, write it into the sections and don't flag; the private half says how to recognise one: read `skills/linear-triage/SKILL.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill. Ask only the question that blocks that delivery, and leave policy that belongs to the caller out of a tool's issue. When an issue says it needs the owner's approval before build, keep it out of Ready and flag it once, asking whether to build it. When the issue is Low and touches nothing the owner keeps (deleting or rewriting the owner's data, anything that touches Nix's memory or identity, credentials, scope and naming, a new session, a priority, and a High or Urgent security change), park it in Backlog with a comment instead, and post one line to `hq news`. Credentials in a project vault, any vault but the owner's personal ones, are not his: `z-delivery` manages them under its Secrets grant, so don't flag such an issue; groom it for `z-delivery` like any other. Every other credentials question, his personal vaults included, stays his. Once he approves, remove that line from its notes. Don't flag a doc change that only records behaviour an issue or a decision already settles: it belongs in the PR that built that behaviour, so comment that and groom it for `z-delivery`. Don't flag an unreproduced one-off that hasn't recurred: leave it in Backlog with a comment. Step 5 closes it.
8. **End the pass without a message.** On a full pass, first count the day's inflow and post its line, as [references/inflow.md](references/inflow.md) says. Save the line "TRIAGE PASS at <the pass's start time>" in your saved state, `~/.local/share/z-sessions/triage.md`, with "full" after it for a full pass. Keep the notes file for the check, which deletes your scratch files.

## The check

Each loop run is a pass, then the check. A "check now" message from z-delivery runs the check alone, at once, with no pass. The check gathers what waits on the owner, prepares one call for each, and queues the calls in `hq` for the main thread. It never talks to the owner and never applies an answer. Read [references/check.md](references/check.md), and follow its checklist each time.

## Rules

- Never change an issue's scope, close it as not planned, or launch anything. Those are the owner's or delivery's calls.
- Close an issue as superseded only when you're sure other issues carry all its work: comment with links to them, then set it Canceled, and post one line to `hq news`. When you're unsure, flag it with `Needs Geoff`.
- Write comments in plain words, one point each. The check quotes them to the owner.
