# atc results and failing sessions

What atc's results mean, and what to do when a session fails every turn.

- **`done` means a turn finished, not the task.** The task is finished when the session sent a note
  starting `FINAL`, or its PR is out of draft.
- **`delivered` or `answered` means the message arrived,** not that the session acted on it. Its
  next note or PR change shows that.
- **A model alias can resolve to another model** through a gateway. Check `resolvesTo` in
  `atc_spawn_options_get` before you spawn.
- **`atc_spawn_options_get` leaves out a daemon it can't reach,** with its providers. Call it again
  a few minutes later; if the provider is still missing, tell the owner.
- **A tool you need isn't in your list:** search the deferred tools. If it isn't there, tell the
  owner what you needed it for. Never get the same result another way, such as a shell command. The
  commands this file names are allowed.

## A session that fails every turn

Two turns in a row fail with
`API Error: 400 ... unexpected tool_use_id found in advisor_tool_result blocks`. The session can't
recover alone. Keep the advisor tool on whatever you do. Check its worktree with `git status` and
`git log @{u}..`:

- **Uncommitted or unpushed work:** stop it with `atc_session_stop`, which keeps the work, and tell
  the owner.
- **Its context is worth keeping:** stop it, run `hq repair advisor-400 <session_id>` as a dry run,
  and ask the owner to approve `hq repair advisor-400 <session_id> --apply` (the classifier blocks
  transcript writes without his yes). Run it, then message the session to restart. Still failing:
  relaunch.
- **Otherwise, relaunch:** copy its scratch files and evidence to your scratch folder, spawn from
  the same brief on its pushed branch with a new `idempotencyKey`, and forget the old one with
  `atc_session_forget` and `stop: true`.
