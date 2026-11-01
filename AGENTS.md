# Skill edits in hq

Edit hq's own skills in `skills/`. The skills in `.claude/skills/` sync in from zgeoff/tools, so change those in zgeoff/tools.

When you create or change a skill's `SKILL.md`, or a file under its `references/`:

1. Load the `skill-writing` skill, and follow its rules as you write.
2. Run these from the repo root, and fix what they report:
   - `bun x @zgeoff/chex prose <each file you changed>`
   - `bun x @zgeoff/chex links skills/<skill>`
   - `bun x @zgeoff/chex skill skills/<skill>`
3. Run the `cold-read` skill on each file you changed. Fix each finding, or say why you didn't.
4. Run the `deslop` skill on each section you changed.
5. Put three headings in the PR description, each with text under it:
   - `## Skill checks`: the chex output.
   - `## Cold read`: each finding and its answer, or "none".
   - `## Deslop`: what the deslop pass changed, or "none".

`hq review gate` holds a skill PR until those headings are in its description.
