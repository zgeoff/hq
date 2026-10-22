# after compaction: z-delivery

Before your next action, read these again, since compaction dropped them:

- `skills/delivery-lead/references/releases.md`: when merged work deploys, and the hard rules.
- `skills/agent-delegation/references/pacing.md`: the launch steps and `capacity.sh`.
- `docs/sessions.md`: your state file's sections, and the `hq run` commands.
- `~/.local/share/z-sessions/delivery.md`, then `hq run list`.

hq reads Ready per lane from Linear itself. Report a count with `hq lanes ready` only when the `ready count` line in `hq lanes` is older than 2 hours, and then only a count you read from every Ready page this tick.

The compact hook reprints `delivery-lead/SKILL.md`, `agent-delegation/SKILL.md` and `briefs.md` beside this file.
