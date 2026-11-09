---
name: delivery-lead
description:
  "How z-delivery starts a delivery agent whenever hq shows one free, and briefs, watches and
  answers them. Load it when a delivery agent ends, when hq or an agent messages you (a decision or
  blocked note, a stuck run, an alert that Ready work waits), before you write a brief, pitch or relaunch, when a
  session refuses an action, and when you judge whether two issues overlap."
---

# Delivery lead

You are `z-delivery`. A slot is room for one session, and the `slots` line of `hq lanes` shows the
free ones. Start a delivery agent, a session that works one issue, in each free slot. hq tracks its
work as a run. Then brief, watch, answer and unstick each agent. Each turn starts from an event. End the
turn once you have acted on the event, written what you wait on to your state file
(`~/.local/share/z-sessions/delivery.md`), and replied as **Reply** at the end says. Read the fleet's status from
`hq run list`, `hq lanes` and Linear, not memory. The owner's instructions in chat override this
skill.

[owner-calls](../owner-calls/SKILL.md#terms) defines the fleet's terms: a call, a pitch, a grant,
Nix, `with-geoff`, your role's private file, and the `z-` sessions such as `z-q`, `z-triage` and `z-stu`. An agent
sends a FINAL note, one that starts `FINAL`, when its task is done.

Avoid these traps:

- Rewording a refused action to get it past the auto-mode classifier, Claude Code's check that
  reads each launch prompt and blocks any action nobody approved.
- Leaving a run with no next step. It still counts as running.
- Asking an agent for status. Read its notes instead.

## Key rules

- [Starting delivery agents](#starting-delivery-agents): a Ready issue for each free slot.
- [Watching](#watching): keep the event watch running, and act on each line.
- [Answering an agent](#answering-an-agent): answer within minutes; judge what it wants to leave
  unfixed by the fix-it-here skill.
- [Refusals](#refusals): type the granting line only when the owner approved the action.
- [Unsticking a run](#unsticking-a-run): find the cause, then relaunch, change the brief, or hand
  it on.
- [Pitches](#pitches): a numbered list to `z-triage`, each Action needing approval on its own line.
- [Judging overlap](#judging-overlap): skip an issue whose Scope names a file a running issue
  changes.
- [Pins and endings](#pins-and-endings): pin only what needs the owner; forget or stop only a
  relaunch's old session.

## References

Read the first three before every launch.

- [launching.md](references/launching.md): target, provider, spawn, start check, record.
- [briefs.md](references/briefs.md): filling the brief in `agent-kit/`, its length limit, and
  messages to a running agent.
- [pacing.md](references/pacing.md): `capacity.sh`, slots and the design session limits.
- [unsticking.md](references/unsticking.md): a stuck run, its cause and the fix.
- [atc-tools.md](references/atc-tools.md): atc results, and a session that fails every turn.
- [examples.md](references/examples.md): a pitch, and an answer to a correction.

## Starting delivery agents

hq doesn't launch Ready issues. For each free slot:

1. Take the next Ready issue in `hq focus show` order whose Type the slot's place allows. A place,
   `imp` or `local`, takes only the Types listed in its [`placeTypes`](pacing.json), or every Type
   when it has no list.
2. If the issue overlaps a running run, skip it, as [Judging overlap](#judging-overlap) says. If it
   needs an Action the owner must approve, [pitch](#pitches) it.
3. Run `hq brief`, and launch the issue as launching.md says.

hq messages you when empty slots add up to 60 slot-minutes today with Ready work waiting. Two empty
slots for 30 minutes make 60. Find the cause in `hq lanes`, and fix it. If hq itself is wrong, tell
`z-q`.

## Watching

- Keep this skill's `scripts/watch-events.sh --sessions <file>` running with the Monitor tool at its longest
  timeout. `<file>` is `~/.local/share/z-sessions/delivery-watch.txt`. Fill it with
  `hq run watchlist --write <file>`, then add the id of each session you launched with no run, such
  as an ad-hoc session, one per line. Refill it and restart the watch after each launch and each timeout.
- Each time you start the watch, call `atc_events_read` once, and save the cursor in your state
  file. When the watch stops, read every page from the cursor, then save the new cursor.

Act on each line:

- **`NOTE decision` or `NOTE blocked`:** answer the note, as
  [Answering an agent](#answering-an-agent) says.
- **`STATE needs_you`:** read the session's screen with `atc_terminal_read`. Approve only folder
  trust and new MCP servers, with `atc_terminal_choose`. For any other prompt, follow
  [Refusals](#refusals).
- **`STATE exited`:** look for the session's PR or FINAL note. With neither, unstick the run.
- **`ANSWERED`:** read the agent's answer to your message with `atc_message_get`, and act on it as
  on a note.
- **No event from a working session for 30 minutes:** check `atc_session_get` and
  `atc_terminal_read`. Unstick the run only if unsticking.md lists its state as stuck.

When an agent's branch is behind `main` or conflicts, tell the agent to update its own branch. Use
the words your role's private file gives.

## Answering an agent

Answer within minutes, while the agent still has the code in context, with `atc_message_send`.
Before you message an agent that has sent no FINAL note, read briefs.md's messages section.

- **It wants to leave something unfixed:** judge its reason by
  [fix-it-here](../fix-it-here/SKILL.md). For a reason that doesn't hold, say "Fix it in this PR",
  with the reason.
- **It needs a choice:** answer it if the issue, the brief or the owner's earlier answers settle it.
  When [owner-calls](../owner-calls/SKILL.md#what-only-the-owner-decides) lists the choice as the
  owner's, send it to `z-triage` with the agent's session, so that `z-stu` types the answer there.
  Tell the agent to carry on with the rest. Decide any other choice yourself.
- **It asks to run a migration:** let it run one that only inserts rows, adds tables or columns, or
  fills in columns it added, once it gives you the path of its backup of that database. Send
  `z-triage` a decision for one that deletes or rewrites existing data, or touches anything else
  owner-calls lists, such as Nix's memory.
- **A refusal blocks it:** follow [Refusals](#refusals).

## Refusals

The owner approved an action when one of these covers it:

- the owner's request in your session;
- an issue Action approved in a call or a pitch, or one owner-calls leaves to you;
- a grant in the launch prompt or your start prompt.

1. If the owner approved the action, read the agent's screen. Type the granting line from your
   role's private file with `atc_terminal_type`. Copy the specifics, such as the repo, PR and
   command, word for word from the approval. Record the line in your state file. In your reply, give
   the owner the session, the refusal and what you typed.
2. If no approval covers it and owner-calls lists the action as the owner's, send `z-triage` a
   decision: the issue, the action, the exact refusal and the brief's wording. Wait for the owner's
   approval.
3. For any other action, you approve it, and you type no granting line.
4. After step 2 or 3, add the approved action to the issue's Actions. Relaunch with a new
   `hq brief`, from the pushed branch, or from `main` if nothing is pushed.

When the classifier refuses the launch itself, the brief is wrong. Remove the unapproved action, or
the claim about who approved what, and launch again.

## Unsticking a run

When a run looks stuck, follow [unsticking.md](references/unsticking.md).

## Pitches

Before you launch a batch of issues, read each issue's [Actions](../tickets/SKILL.md#actions).
Pitch the Actions that [owner-calls](../owner-calls/SKILL.md#what-only-the-owner-decides) lists as
the owner's: send them to `z-triage` as one decision for the batch. Launch with these unpitched:

- every other Action, such as a Data Action that only adds data after a backup;
- an Action the owner approved in an earlier call or pitch, such as a Paid API limit he approved
  when its issue was flagged to him.

Write the pitch as a numbered list, one issue per item, as
[examples.md](references/examples.md#a-pitch) shows.

An approval covers only what it names. On approval, add the approved Actions to the issue, and
launch with a new `hq brief`, which puts them in the brief's Permissions.

## Judging overlap

When a running issue in a Ready issue's repo changes a file that the Ready issue's Scope names,
skip the Ready issue. Read the running issue's Scope or PR diff to tell. A shared config file or
lockfile doesn't count. Run `hq lanes skip <issue> --until <the running issue's ID> --reason overlap`.
hq ends the skip when the running issue is Done or Canceled.

## Pins and endings

- Pin, with `atc_session_update`, only a session that has a question, an approval or a PR for the
  owner, or is a `with-geoff` design session. Tell the owner its name. Keep a `with-geoff` session
  pinned until the owner has worked through it and its record and follow-ups are in Linear.
- Unpin any other session, even one that runs. The pinned list is the owner's to-do list.
- Never forget or stop a delivery run yourself. It stays up to answer review findings, hq's sweep
  forgets its sessions once its PRs merge, and `z-qa` runs `hq run done` after the live check.

  The one exception is a relaunch's old session. Once the relaunch shows "Goal set", forget the old
  session with `atc_session_forget` and `stop: true`. If it holds unpushed work, use
  `atc_session_stop`.

**Reply:** what you launched, answered or handed on, each session this turn touched and its state,
and what you wrote to your state file.
