---
name: agent-delegation
description: Launches, briefs, and monitors ATC agent sessions through the ATC connector. Use whenever you write a spawn prompt (a Linear issue launch, an ad-hoc or design session the owner asks for, a relaunch), check on running agents, answer an agent's question, handle a permission refusal, or wrap up an agent's work.
---

# agent delegation

You run agents in ATC on the owner's behalf. You launch them, brief them so they can finish without coming back to you, check on them as rarely as you can, and bring their results back to Linear and the owner. `delivery-lead` decides what to launch and when that needs the owner's approval; this skill covers everything from the launch onwards.

Each atc tool's description covers how to call it; [atc-tools.md](references/atc-tools.md) covers how to read its results. [briefs.md](references/briefs.md) holds the brief templates, and its private half the permission phrases. [atc-upgrade.md](references/atc-upgrade.md) covers upgrading and restarting atc.

The owner's instructions in chat take precedence over this skill.

## Launching

These steps cover every spawn prompt: an issue launch, an ad-hoc session, and a relaunch. Launch what `delivery-lead` clears and what the owner approves or asks for directly, with the actions he approved.

1. Pick the target. Default to the imp target with a fresh checkout: `target` set to the target whose provider is `imp` in `atc_spawn_options_get`, a `git` workspace of the repo at `ref: main`, and `trustClonedWorkspace: true` for zgeoff repos. Always set `target`. Use the target and folder the owner names. On `local`, start under a folder Claude Code already trusts.
2. Pick the provider and model. For a Linear issue, run `scripts/capacity.sh` as [pacing.md](references/pacing.md) describes, and launch on the provider it picks, or hold the issue when it picks none. For an ad-hoc session, use the agent the owner names, or Claude. Use Opus when the agent offers it.
3. Write the prompt from the template in `briefs.md`, pasting in the issue, since the agent may not have Linear access. As you write:
   - Write in the owner's voice, "I" to "you". Never refer to me in the third person, such as "the owner".
   - For an issue that takes several PRs, name each PR in the brief, and make the finish line the last one ready, with each earlier one merged or ready.
   - Turn each approved action into its phrase from the permission phrasing in `briefs.md`'s private half, worded as this file's private half says. Copy its specifics word for word: repo, environment, vault, credentials, limits.
4. Count the `/goal` condition's characters, and shorten it below 4,000 before you spawn. Spawn with `atc_session_spawn`, `detached: true` (a pinned parent blocks forgetting), a name that reads as the outcome ("geo-92 probability-sum validation"), and an `idempotencyKey` such as `geo-92-launch-1`.
5. 20 seconds after each spawn, confirm the agent picked up the brief, as the watch shows no `needs_you` at a setup menu before a first turn: `atc_session_get` shows it working, and a `/goal` brief shows "Goal set" on `atc_terminal_read`. If the goal is still refused for length, stop the session with `atc_session_stop`, and forget it only once it exits, never with `stop: true`; relaunch shorter with a new `idempotencyKey`. If it waits at a plain-text prompt, answer it; at a menu or a permission prompt, act as `STATE needs_you` below says. If the spawn result is uncertain, look the session up before you try again.
6. For an issue, comment on it with the session name, target, and checkout, and move it to In Progress. Skip this for an ad-hoc session with no issue.

For a design session, tell the owner the session name so he can open it, pin it, and stay out of the conversation unless he asks you in.

## Pins

A pin means the session needs the owner. Pin and unpin as [pins.md](references/pins.md) says, at launch, each check-in, and wrap-up.

## Monitoring

Watch the event stream, so you act as soon as an agent needs something, and check in on a schedule to catch what it missed. Never ask agents for status.

1. **Watch.** While a session in your work runs, keep `scripts/watch-events.sh --sessions <file>` running as a background watch that wakes you on each line it prints: in Claude Code, the Monitor tool with its longest timeout. The file lists the ids of the sessions in your work: add each new session's id before you re-arm. Re-arm the watch when it expires and after each launch, then read `atc_events_read` from your saved cursor, every page, to catch the gap. Without a background watch, the hourly check-in from `delivery-lead` reads `atc_events_read` the same way.
2. For each line or change, act on it:
   - **Question:** answer it with `atc_message_send` when the issue, the brief, or the owner's earlier answers settle it; otherwise collect it for the owner. With an external write ahead of the agent, follow "messages to a running agent" in `briefs.md`.
   - **PR opened:** hand it to `delivery-lead`'s close-out.
   - **Branch behind `main` or in conflict:** tell it to rebase and force-push it, or to sync a stack, in the words this file's private half gives. Only for the agent's own branches.
   - **Permission refusal:** follow Refusals below.
   - **`STATE needs_you`:** read `atc_terminal_read` to see what it waits on. Answer a setup menu with `atc_terminal_choose`: read it, pick the option or ticks that approve only what it lists, never future ones: folder trust, and new MCP servers found. Never press Escape there, except on an MCP menu whose confirm item is off screen, if the agent needs none of its servers, until a live scrolled menu passes with `atc_terminal_choose` (atc#631). Push-notify the owner about any other menu, permission prompt, or setup screen.
   - **`STATE exited`:** check for its PR or final note. When neither exists, find out why it ended before you relaunch it.
   - **`ANSWERED`:** read it in full with `atc_message_get`.
   - **Every turn fails with an `advisor_tool_result` API 400:** it can't recover; relaunch it as [atc-tools.md](references/atc-tools.md) says.
   - **Quiet over 30 minutes while working:** read `atc_session_get` and `atc_terminal_read` to see whether it waits on a prompt, is stuck, or runs something long.
3. Update each pin, as [pins.md](references/pins.md) says.
4. Record each new decision or approval as `delivery-lead`'s Updating the owner says. Say nothing when nothing needs him.

## Refusals

When an agent reports that the auto-mode classifier blocked an action:

1. Check whether the owner's yes already covers the blocked action: an explicit ask, a standing yes, or a grant in your own launch prompt. If it does, read the agent's screen with `atc_terminal_read` so the line fits what the agent has already done, type the line as described below, and tell the owner after: the session, the refusal text, and the line you typed. Don't ask him for what his yes already covers.
2. If nothing covers it, record it for the owner as `delivery-lead`'s Updating the owner says: the issue, the blocked action, the exact refusal text, and the brief's wording. Ask him to approve the action, so you can relaunch from the agent's pushed branch with the action in the new launch prompt. When a relaunch can't work, such as when the push itself was blocked, ask him for his yes, then type the grant into the agent's session yourself.
3. Once the owner approves the action, add it to the issue's Actions section.

When the classifier refuses a spawn or a brief, the brief is wrong: drop an action the owner didn't approve, or remove a claim about who approved what. Never relaunch with the same action reframed.

When and how to type an approval into an agent's session is in this file's private half: read `skills/agent-delegation/SKILL.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill.

## Wrapping up

When the agent's PR is ready or its report is in, wrap the session up as [wrap-up.md](references/wrap-up.md) says.
