---
name: agent-delegation
description:
  How to launch, brief, watch and answer ATC agent sessions through the ATC connector. Load it
  before you write a spawn prompt (a pitch launch, a relaunch, a design or ad-hoc session), answer
  an agent, act on a session's state, handle a permission refusal, or pin a session.
---

# agent delegation

This skill covers every launch you make and everything you do while an agent runs. A Ready issue
launches from the standard brief in [templates/brief.md](templates/brief.md): hq does not launch
Ready work, so `z-delivery` launches it by hand, as `delivery-lead` says. A pitch launch, a
relaunch, and a design or ad-hoc session each start from their own template. `hq run done` wraps
each delivery run up. Each atc tool's description covers how to call it.

The owner's instructions in chat take precedence over this skill.

## Key rules

- [Launching](#launching): write every prompt from a template, in the owner's voice, with each
  approved action as its permission phrase.
- [Watching](#watching): keep the event watch armed; act on each line it prints, and never ask an
  agent for status.
- [Answering an agent](#answering-an-agent): answer from the issue, the brief and the owner's
  earlier answers; an item stays unfixed only for another repo or a named choice.
- [Refusals](#refusals): type a grant only under a yes that already covers it; a refused brief is
  wrong, so fix it.
- [Pins](#pins): a pin means the session needs the owner, and nothing else.
- [Ending a session](#ending-a-session): `hq run done` ends a delivery run; keep a design session
  pinned until the owner has worked through it.

## References

- [briefs.md](references/briefs.md): the brief templates, the length limit, and messages to a
  running agent. Read it before every spawn prompt.
- [noslop-brief.md](references/noslop-brief.md): the review lines a brief for a noslop repo
  carries.
- [design-brief.md](references/design-brief.md): a design session's prompt.
- [investigation-brief.md](references/investigation-brief.md): an Investigation's prompt.
- [brief-example.md](references/brief-example.md): a filled-in delivery brief.
- [pacing.md](references/pacing.md): `capacity.sh`, before any launch you make yourself.
- [atc-tools.md](references/atc-tools.md): what atc results mean, and a session that fails every
  turn.

## Launching

1. **Pick the target.** Default to the imp target with a fresh checkout: `target` set to the target
   whose provider is `imp` in `atc_spawn_options_get`, a `git` workspace of the repo at `ref: main`,
   and `trustClonedWorkspace: true` for zgeoff repos. Always set `target`. Use the target and folder
   the owner names. On `local`, start under a folder Claude Code already trusts.
2. **Pick the provider.** For an issue, run `scripts/capacity.sh` as [pacing.md](references/pacing.md)
   says, and launch on the provider it picks, or hold the issue when it picks none. For an ad-hoc
   session, use the agent the owner names, or Claude. Use Opus when the agent offers it.
3. **Write the prompt** from its template in [briefs.md](references/briefs.md), with the issue
   pasted in, since the agent may not have Linear access. Write in the owner's voice, "I" to "you",
   because the classifier reads the launch prompt as his words, and a third-person "the owner"
   reads as someone else's claim. Turn each approved action into its permission phrase from the
   private half of `briefs.md`, with its specifics copied word for word.
4. **Spawn** with `atc_session_spawn`, `detached: true`, a name that reads as the outcome
   ("geo-92 probability-sum validation"), and an `idempotencyKey` such as `geo-92-launch-1`. Keep
   the `/goal` condition under 4,000 characters, or the goal is refused.
5. **Confirm the pick-up** 20 seconds later: `atc_session_get` shows it working, and a `/goal`
   brief shows "Goal set" on `atc_terminal_read`. A goal refused for length: stop the session with
   `atc_session_stop`, forget it once it exits, and relaunch shorter with a new `idempotencyKey`.
   When the spawn result is uncertain, look the session up before you try again.
6. **Record it.** `hq run add <issue> --title T --session <id> --where imp|local` for an issue,
   with `--design agent|with-geoff` for a design pass, then comment the session name, target and
   checkout on the issue and move it to In Progress.

For a design session, tell the owner its name so he can open it, pin it, and stay out of the
conversation unless he asks you in.

## Watching

While a session in your work runs, keep `scripts/watch-events.sh --sessions <file>` running in the
background with the Monitor tool, at its longest timeout. The file lists the ids of the sessions in
your work: add each new id, and re-arm the watch after each launch and when it expires. After a
re-arm, read `atc_events_read` from your saved cursor, every page, to catch the gap. hq also sends
you each `decision` and `blocked` note an agent writes.

Act on each line:

- **`NOTE decision` or `NOTE blocked`:** answer it as [Answering an agent](#answering-an-agent)
  says.
- **`STATE needs_you`:** read `atc_terminal_read`. Answer a setup menu with `atc_terminal_choose`,
  approving only what it lists: folder trust, and new MCP servers found. Push-notify the owner about
  any other menu, permission prompt or setup screen.
- **`STATE exited`:** check for its PR or FINAL note. With neither, find out why it ended before you
  relaunch, as `delivery-lead`'s Unsticking a run says.
- **`ANSWERED`:** read it in full with `atc_message_get`.
- **Quiet for over 30 minutes while working:** read `atc_session_get` and `atc_terminal_read` to see
  whether it waits on a prompt, is stuck, or runs something long.

A branch behind `main` or in conflict: tell the agent to bring its own branch up to date, in the
words this skill's private half gives.

## Answering an agent

Answer with `atc_message_send` when the issue, the brief or the owner's earlier answers settle the
question. An agent that wants to leave an item unfixed gets "Fix it in this PR" unless the fix is in
another repo or needs a choice the issue doesn't settle, which the note names. Size, time, a narrow
brief and a missing permission are not reasons: give the permission when your grants cover it, as
Refusals says. A choice only the owner can make goes to `z-triage`, and the agent carries on with
everything that doesn't depend on it. Before a message to an agent with an external write ahead of
it, read "messages to a running agent" in [briefs.md](references/briefs.md).

## Refusals

When an agent reports that the auto-mode classifier blocked an action:

1. Check whether the owner's yes already covers it: an explicit ask, a standing yes, or a grant in
   your own launch prompt. When it does, read the agent's screen with `atc_terminal_read`, type the
   grant line as this skill's private half says, and tell the owner after: the session, the refusal
   text and the line you typed.
2. When nothing covers it, send it to `z-triage` as a decision: the issue, the blocked action, the
   exact refusal text and the brief's wording. Once the owner approves, relaunch from the agent's
   pushed branch with the action in the launch prompt, and add it to the issue's Actions.

When the classifier refuses a spawn or a brief, the brief is wrong: drop an action the owner didn't
approve, or remove a claim about who approved what. A relaunch with the same action reframed is
refused again, and it reads as an attempt to get around the classifier.

## Pins

A pin means the session needs the owner: a question, an approval, a PR that waits on his review,
or a design or audit session that waits on him. Pin and unpin with `atc_session_update` only the
sessions in your work and their children, never the owner's own sessions. Keep every other session
unpinned, even one that is kept or still running, so the owner's pinned list is a to-do list. When
you pin one, tell the owner its name. Re-check the pin when the session's state changes.

## Ending a session

- **A delivery run:** once the run is in `merged`, `live-check` or `deploy-held`, and every PR of it
  is merged or closed with at least one merged, the sweep forgets the run's sessions and their
  children. It checks an imp for unpushed work before it destroys it, and names each session it
  keeps in `hq news`. Leave the session running until then, so the agent can answer review findings.
  `hq run done` ends the run once its live check passes or no check is owed, and frees the slot.
- **A relaunch:** forget the old session with `atc_session_forget` and `stop: true` once the new
  one has picked up its brief. Use `atc_session_stop` instead when it holds unpushed work.
- **A design or audit session:** keep it pinned and running until the owner has worked through its
  decisions, and its record and follow-ups are in Linear. Then unpin it and forget it. Never unpin
  a session in order to forget it while it still needs him.
