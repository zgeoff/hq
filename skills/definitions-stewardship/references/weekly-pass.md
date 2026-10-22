# the weekly pass

How `definitions-stewardship` runs the Monday consolidation pass, and the cron job that starts it.

Each Monday, run one consolidation pass over the skills, as its own PR. Bring each `SKILL.md` and `briefs.md` under 8,500 characters, as the compact hook counts them. Move incident detail, such as an issue ID, a date or the story of a failure, out of a skill into `evaluation.md`, and keep only the rule. Merge rules that say the same thing, and cut a rule that a script or lint now checks. Drop no rule: list each cut sentence in the PR, with where its rule now lives. Change no behaviour; a change that would is a proposal. Also run each check in `evaluation.md` that names the weekly pass, and record its result there. `z-stu` agrees it, since the fleet's skills live in `hq`.

A daily session cron job in your session starts it, at about 09:00 Sydney time, with this prompt:

```text
Steward daily: load definitions-stewardship. If this job was created 6 or more days ago, as steward.md records, delete it with CronDelete, create it again with CronCreate from this prompt, and save the new time in steward.md. On a Monday, run the weekly pass. Every day, run the process-work look in references/process-work.md.
```

Create it when CronList shows none, and save its creation time in your state file. A recurring job expires after 7 days, so a weekly job would never run twice.
