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
5. Put three headings in the PR description, each with text under it:
   - `## Skill checks`: each step 2 command and its output from the last run, in a `text` block.
   - `## Cold read`: each finding and its answer, or "none".
   - `## Deslop`: what the deslop pass changed, or "none".

The `z-review` session runs `hq review gate` before it merges an hq PR. The gate holds a PR that changes those files until its description has the three headings.
