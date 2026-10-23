# reading atc results

Each atc tool's own description covers how to call it. These points cover what its results mean.

- A session in the `done` state finished a turn, not its task. Its PR or its final note shows whether the task is finished.
- A message that is `delivered` or `answered` reached the agent. Its next note or PR shows whether it acted on the message.
- A model alias such as `opus` can resolve to a different backend on a gateway. Check `resolvesTo` in `atc_spawn_options_get`.
- `atc_spawn_options_get` leaves out a daemon it can't reach, so an agent missing from its results may still exist.
- When a tool or argument you need isn't in your tool list, under any connector prefix, tell the owner what you needed it for. Never reach the outcome another way.

## A session that fails every turn

When every turn fails with `API Error: 400 ... unexpected tool_use_id found in advisor_tool_result blocks`, the session can't recover by itself. Keep the advisor on whichever way you take.

- **Relaunch, the default.** Save its scratch files and evidence, relaunch from its brief and pushed branch with a new `idempotencyKey`, and forget the old session.
- **Repair it,** when its context is worth more than a fresh start. Stop the session, run `hq repair advisor-400 <session>` for a dry run, and ask the owner to approve the exact command `hq repair advisor-400 <session> --apply`, because the classifier blocks an agent from writing a transcript without his yes. Relaunch when the repaired session still fails.
- **Keep it stopped,** when it holds uncommitted or unpushed work. Stop it with `atc_session_stop`, which keeps the work, and tell the owner.
