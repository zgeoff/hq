# skills

Each skill is one of the fleet's roles, or part of one; `docs/skill-development/roles-design.md` in zgeoff/hq-private covers the split.

| Skill                                                       | Covers                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [linear-triage](linear-triage/SKILL.md)                     | grooming Linear issues to the standard, and preparing the decisions that wait on the owner |
| [intake](intake/SKILL.md)                                   | The main thread: the owner's questions, bug reports and requests, and putting calls to him |
| [delivery-lead](delivery-lead/SKILL.md)                     | starting a session, pitching, session schedules, releases and deploys                      |
| [agent-delegation](agent-delegation/SKILL.md)               | launching, pacing, briefing, monitoring, and wrapping up ATC agents                        |
| [pr-review](pr-review/SKILL.md)                             | `z-review`: reviewing and merging the delivery agents' PRs                                 |
| [preview-qa](preview-qa/SKILL.md)                           | `z-qa`: live checks on previews before the merge, and read-only after the release          |
| [delivery-report](delivery-report/SKILL.md)                 | daily and weekly reports of merged PRs, on request                                         |
| [definitions-stewardship](definitions-stewardship/SKILL.md) | turning feedback into changes to these skills                                              |

Each folder is a self-contained skill in the Agent Skills format. A skill's `scripts/` folder holds its mechanical work. A script reads files the agent saved from its connector, and never calls Linear itself.

## Keeping copies in step

`linear-triage/references/tickets.md` restates the ticket sections and Actions catalogue from [linear/templates.md](../linear/templates.md), because a skill reads only its own folder. Change both together.
