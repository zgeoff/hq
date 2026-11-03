# Skill edits in hq

Edit hq's own skills in `skills/`. The skills in `.claude/skills/` are shared skills that sync in from zgeoff/skills, so change those in zgeoff/skills.

When you create or change a skill's `SKILL.md`, or a file under its `references/`, in `skills/`:

1. Load the `skill-writing` skill, and follow its rules as you write.
2. Run these from the repo root, and fix what they report. Expect each to end with a `cleared:` line.
   - `bun x @zgeoff/chex prose <each file you changed>`
   - `bun x @zgeoff/chex links skills/<skill>`
   - `bun x @zgeoff/chex skill skills/<skill>`
3. Run the `cold-read` skill on each file you changed. Fix each finding, or note why you didn't for the PR description.
4. Run the `deslop` skill on each section you changed. Then run step 2 again.
5. In the PR description's `## Checks` section, tick these three lines, as the PR template shows:
   - `- [x] chex prose, links and skill: cleared`, after the step 2 commands end with `cleared:`.
   - `- [x] Cold read: <n> fixed, <n> declined`.
   - `- [x] Deslop: <n> edits`.

   Under `Declined:`, give each finding you declined one line: the review that found it, the
   finding, then why not or the issue it went to. Or write `Declined: none.` Paste no command
   output, fixed finding or deslop diff.

The `z-review` session runs `hq review gate` before it merges an hq PR. The gate holds a PR that
changes those files until its `## Checks` section has the three ticked lines in the form step 5
gives, and a line under `Declined:` for each finding the ticked lines count as declined.
