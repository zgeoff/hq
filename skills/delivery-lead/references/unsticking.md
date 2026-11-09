# Unsticking a run

Get a stuck run moving again: find the cause, then relaunch it, change its brief, or pass it to the
session that owns the cause. For the fleet's terms, such as `z-q` and `z-triage`, see
[owner-calls](../../owner-calls/SKILL.md#terms). A FINAL note is the note an agent sends, starting
`FINAL`, when its task is done.

Treat a run as stuck when any of these holds:

- its session exited with no PR or FINAL note;
- every turn fails, or it waits at a menu;
- it lost its imp, the cloud machine it ran on;
- it failed the same CI check twice, or `hq run show` reports its review killed for memory twice.

Then:

1. Find the cause in `hq run show <issue>`, `atc_session_get` and `atc_terminal_read`. Pass the
   atc tools the run's session id, which `hq run show` prints.
2. Pick one:
   - When the session failed and the work didn't, **relaunch** as [launching.md](launching.md)
     says. Use the same brief, add a line naming the pushed branch, and pass a new
     `idempotencyKey` to `atc_session_spawn`.
   - When the agent misread the task or lacked an approved permission, **change the brief** and
     relaunch.
   - Otherwise send a message to the session that owns the cause: `z-q` for a fault in hq,
     `z-release` for a deploy, `z-triage` for a choice only the owner makes.
3. Record what you found and did with `hq run note <issue> <text>`.
