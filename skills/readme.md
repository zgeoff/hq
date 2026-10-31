# skills

Each skill is one of the fleet's roles, or part of one; `docs/skill-development/roles-design.md` in
zgeoff/hq-private covers the split.

Each session loads its role's skill plus the shared skills it needs; `fleet.json` lists them.

| Skill                                       | Covers                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| [tickets](tickets/SKILL.md)                 | shared: what a good issue is, Ready, fields, Actions, cross-repo work, saving     |
| [fix-it-here](fix-it-here/SKILL.md)         | shared: when a finding may stay unfixed, which answers hold, fixing well          |
| [owner-calls](owner-calls/SKILL.md)         | shared: what only the owner decides, how to put it to him, his answers as records |
| [evidence](evidence/SKILL.md)               | shared: what proves Acceptance before the merge and once live, done by type       |
| [intake](intake/SKILL.md)                   | `z-stu`: the owner's questions, bugs and requests, focus, calls, reports          |
| [linear-triage](linear-triage/SKILL.md)     | `z-triage`: passes, flags, closing, overlap, and the check that builds calls      |
| [delivery-lead](delivery-lead/SKILL.md)     | `z-delivery`: filling slots, launching, briefing, watching and answering agents   |
| [pr-review](pr-review/SKILL.md)             | `z-review`: reviewing and merging every PR, and filing follow-ups                 |
| [release](release/SKILL.md)                 | `z-release`: release PRs, deploys, bumps, host switches and atc upgrades          |
| [preview-qa](preview-qa/SKILL.md)           | `z-qa`: live checks on previews before the merge, and read-only after the release |
| [delivery-report](delivery-report/SKILL.md) | daily and weekly reports of merged PRs, on request                                |

What agents and helper sessions receive, rather than load, lives in `../agent-kit/`: the delivery
brief, its playbooks, the review lines, and the helper briefs.

Each folder is a self-contained skill in the Agent Skills format. A skill's `scripts/` folder holds
its mechanical work. A script reads files the agent saved from its connector, and never calls Linear
itself.

## Keeping copies in step

`tickets/SKILL.md` restates the ticket sections and Actions catalogue from
[linear/templates.md](../linear/templates.md), because a skill reads only its own folder. Change
both together.

## Changing a skill

A skill changes through an ordinary issue and PR, and every PR that changes `skills/`, `fleet.json`,
or hq-private's skills, grants or start prompts waits for the owner's lgtm: `hq review gate` holds
it until his answer is on record. Load the `skill-writing` skill before you edit one, and follow it:
the skill gate refuses an edit under `skills/` until you have.

- **Name the rule that failed.** The PR description says which existing rule should have covered the
  failure, and why it didn't. Fix that rule rather than add a near-duplicate beside it.
- **Prefer a check to a sentence.** When a tool or script can enforce a rule, build that and delete
  the prose.
- **Keep must-hold rules in `SKILL.md`,** at the step where they apply. A reference holds how-to
  detail, and `SKILL.md`'s References list names the task that needs each one.
- **Grants live in hq-private's `grants/<session>.yaml`.** Run
  `bun run grants --private <hq-private>` from an hq checkout to write each start prompt's Grants
  block, and add `<session>-<id>` to the names that prompt lists for `hq grant act`. The still-ask
  list lives once in `grants/still-ask.yaml`.
- **Run the checks:** `bun run fmt`, `bun run check:grants`, `bun run check:skills` (each `hq`
  command a skill names against `hq --help`), `bun run test:scripts`, the `skill-writing` skill's
  `check-skill.sh` with 0 warnings, and `hq defs check` when the change touches hq-private.
- **Keep each `SKILL.md` the compact hook reprints at or under 9,700 characters,** as
  `sed -E 's/ {2,}/ /g; s/-{4,}/---/g' <file> | wc -c` counts them, because the hook swaps a longer
  file for a path the session doesn't read.
- **After the merge,** run `hq defs sync`, and tell each session whose skill changed what it now
  does differently.
