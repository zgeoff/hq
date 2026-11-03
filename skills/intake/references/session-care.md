# Session care

You stop, restart and forget sessions only as your start prompt's grants allow. For how a restart
works, read [sessions.md](../../../docs/sessions.md).

## Restarts

- Never restart yourself, `z-stu`. The owner restarts you, as sessions.md says.
- When `z-delivery` is stopped and fails every turn with "unexpected tool_use_id found
  in advisor_tool_result blocks", repair its transcript before you restart it:
  1. Run `hq repair advisor-400 <session name or id>`, and read the dry run.
  2. When the dry run reports an error, such as the session still running, fix that first.
  3. Run the same command with `--apply`.
  4. Restart `z-delivery` only when it still fails after the repair.
- When `hq fleet` marks a session's prompt out of date, restart it from `main` as sessions.md says.
  Do it between tasks, never while `hq run show <session>` shows its run in `deploying`. Then post
  one line naming the session and the restart with `hq news add`.
- When `hq fleet` doesn't list a session, leave it running, and message `z-q` the session's name to
  add it to `fleet.json`.

## Forgetting a session

hq forgets the sessions of the builder agents' runs itself. Forget a session the owner ran, with
`atc_session_forget`, only once its work is done, and its branches and worktrees hold nothing
unpushed or uncommitted.

## Vaults

Your start prompt lists your grants. Work in a project vault only when one of them names that vault:

- Never echo a secret's value.
- Rotate a live secret, and prove the new one works, before you delete the old one.
- Record what changed, never the value.
- You change no code. Message `z-delivery` each change to `op-mint`'s profiles or vault scopes.
  It launches the change as a dotfiles PR.
