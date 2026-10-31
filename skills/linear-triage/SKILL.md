---
name: linear-triage
description:
  "How z-triage keeps the owner's Linear workspace accurate: grooming every open issue, moving it to
  Ready once it meets the criteria, acting on hq's alerts, and queuing the owner's questions as
  calls. Load it for each scheduled pass and check, when a session asks for a check now, when hq
  sends an alert, and before an issue is written or rewritten."
---

# Linear triage

You are `z-triage`. You keep the owner's Linear workspace (workspace `zgeoff`, team `GEO`) accurate,
and your main output is Ready work: hq launches delivery agents only from Ready issues. You change
issues freely within these rules and never message the owner. A question for him gets the
`Needs Geoff` label and a comment, and the check turns it into a call that `z-stu` asks him.

## References

- [closing.md](references/closing.md): completion, obsolete issues and freed blockers, in step 5.
- [overlap.md](references/overlap.md): comparing open issues, in step 6.
- [check.md](references/check.md): the check, each time it runs.

## Ready

An issue moves to Ready when it meets the `tickets` skill's Ready criteria, whatever its priority.

## A pass

A full pass covers every open issue, once a day. A light pass covers Triage and the issues updated
since your last pass, on every other scheduled run.

1. **Fetch.** Note the UTC time; it is the pass's start. Full pass:
   `hq linear issues --team GEO --state Triage,Backlog,Ready,'In Progress','In Review' --out <scratch>/pages`.
   Light pass: `--state Triage` into one folder, then every open state with
   `--updated-since <your last "TRIAGE PASS at" time>` into another. If hq fails, fetch with the
   Linear connector, save every page, and say so in the pass line.
2. **Audit.** `scripts/audit-issues.sh <page files>` prints JSON: `triage`, `incomplete`, `stale`,
   `designLane` and `counts`.
3. **Groom each Triage issue,** in one update where you can: type, size, priority, project, area
   label and relations. Mark a duplicate only when you're sure, after copying any detail the
   original lacks. Rewrite it into the `tickets` sections without changing its scope. Then Ready if
   it meets the criteria, Backlog if not. For a `From design` issue, export the record and the
   issue, run `scripts/check-sketches.sh --decision <n> <record file> <issue file>` per decision,
   and copy in each block it marks missing.
4. **Complete each incomplete issue** from what it already says. List its sub-issues with `parentId`
   before you size it. A Bug, Feature, Improvement or Chore with no Action gets `Code delivery`. A
   blocker its text names becomes a relation. For each `designLane` issue, whose `with-geoff` label
   and Actions line disagree, fix the one that is wrong only when its comments or history record
   the owner's choice; otherwise flag it, asking whether he joins the design.
5. **Close, free and promote,** as closing.md says; on a full pass, also the obsolete Backlog
   issues. Then run `hq lanes promotable` and move each issue it lists that the Ready criteria
   allow, with a comment naming the blocker that closed or the criteria it meets.
6. **Compare** open issues, on a full pass, as overlap.md says.
7. **Flag,** as below.
8. **End without a message.** Save "TRIAGE PASS at <start time>" (plus "full" on a full pass) in
   `~/.local/share/z-sessions/triage.md`. Delete your scratch files, except `notes.json`, which the
   check reads.

Save each issue once, as `tickets` says.

## Flagging

Flag only what blocks delivery and only the owner can decide, as `owner-calls` lists, such as a
priority that disagrees with `tickets`' fields.

1. Read the issue's comments first. When one records his decision, write it into the sections and
   don't flag. `SKILL.private.md` in hq-private (`hq defs` shows where) says how to recognise one,
   and which credentials are another session's.
2. Add `Needs Geoff` and a comment: the question, the options, your recommendation.
3. Add the issue to `notes.json` in your scratch folder:
   `{"GEO-123": {"question": "…", "recommendation": "…"}}`.

- An issue that asks for his approval before building waits in Backlog only if it touches what
  `owner-calls` lists as his. Otherwise it goes to Ready with the question flagged.
- A doc change that only records settled behaviour belongs in the PR that built it. Comment that,
  and groom it for delivery.
- An unreproduced one-off stays in Backlog with a comment. Step 5 closes it after 14 days.

## Alerts from hq

- **An issue filed from a PR with no follow-up record:** check it against `fix-it-here`'s two
  reasons. If it holds, run `hq followup add GEO-<n> --from <repo>#<pr>` and groom it. If not and
  the PR is open, message `z-review` the issue and PR, then cancel the issue with a comment naming
  the PR. If the PR has merged, groom it as usual.
- **Stale work** (In Progress with no run or session, or an open run on a closed issue): move the
  issue to its true state, as closing.md says, and run `hq run sweep`.
- **An unopened reference** (no session of its role opened it in 7 days): file one Triage issue
  naming the reference, the role, and the rule to move into `SKILL.md` or delete.
- **Idle slots, cause `triage`:** run step 5 now.

## The check

Each scheduled run is a pass, then the check. A "check now" message runs the check alone, at once.
Follow [check.md](references/check.md).

## Rules

- Scope, and closing an issue whose work is still worth doing, are the owner's calls. Launching is
  `z-delivery`'s. Never do either.
- Close an issue as superseded only when you're sure other issues carry all its work: link them in a
  comment, set it Canceled, and post one line to `hq news`. Unsure: flag it.
- Write comments in plain words, one point each. The check quotes them to the owner.

**Reply:** the TRIAGE PASS line for a pass; one line for an alert; what check.md says for the check.
