# Issue fields

Every open issue has one project, one type, one priority and at least one area label. Every issue
has a size, except a Design, an Investigation or a parent with sub-issues. Write each field you set
or fix, with its reason, in one grooming comment.

## Type

The `Type` label group; it takes one label. Leave a close call as it is. Fix a plain mistake, and
comment the old type and why.

| Type          | The issue                                                                            |
| ------------- | ------------------------------------------------------------------------------------ |
| Bug           | fixes wrong behaviour                                                                |
| Feature       | makes something possible that wasn't                                                 |
| Improvement   | makes something work better for its users: a faster command, a clearer error         |
| Chore         | upkeep no user notices: a lint rollout, a sync, a pin, CI                            |
| Design        | settles game design, product scope or policy; Action `Design session`                |
| Investigation | answers questions from evidence alone, such as a measurement or a library comparison |

A Design session runs without the owner unless the issue has `with-geoff`, which only he sets.

## Size

The `Size` label group. `z-delivery` picks the model by size, and builds L and XL as a stack of PRs.
Size by lines changed, tests included, and write the guess in the comment: "L, about 3,000 lines".

| Size | The work                                  |
| ---- | ----------------------------------------- |
| S    | under 500 lines, in one repo and one area |
| M    | 500 to 2,000 lines, in one repo           |
| L    | 2,000 to 5,000 lines, in one repo         |
| XL   | over 5,000 lines, or several repos        |

- A change to how auth, secrets, money, deletion or infra permissions behave, or a migration that
  changes or deletes data, is at least L. Moving or renaming files there, or a migration that only
  adds, takes the size of its lines.
- Size the whole issue, across all its PRs. Split into sub-issues only for separate outcomes, each
  with its own Acceptance, never for size, and never a change that must land together. Then remove
  the parent's size.
- A slice issue ("Slice <n>: …") is a stage of the nixie plan, which the owner plans. Size it XL,
  never split it, and keep it out of Ready until it's planned into sub-issues. An issue that waits
  on a slice gets it as a blocker; match the slice by outcome, since old text can carry a stale
  number.

## Priority

Set it when it's missing: the first that fits.

- **Urgent:** broken and blocking other work; exposes a secret; a security hole something running
  today can reach.
- **High:** a security hole nothing reaches yet (comment what would make it reachable); on the
  critical path of an In Progress project; a deadline in its text within 14 days; a small change
  that shows the owner how well Nix works as he uses her, such as a context counter.
- **Medium:** work a project has committed to, with no date pressure.
- **Low:** everything else.

Never change a priority that's set. When it disagrees with these, flag it and propose the change,
unless the issue quotes the owner choosing it.

## Project

A project holds an outcome; put each issue in the project its work serves.

- Upkeep with no outcome goes in `<area> maintenance`; a feature or design with none goes in
  `<area> roadmap`. Create either when missing.
- When three or more roadmap issues share an outcome, or work needs a new one, flag one of them
  proposing an outcome project, and list the others.
- Set a project In Progress when one of its issues is In Progress or In Review, with a project
  update naming that issue. Never move a project back, pause it or complete it.

## Labels

- **Area,** one or more: the repo or system the work lands in, such as `atc`. List the labels once
  per pass. Create one named for the repo when none fits.
- **`quality`:** work that raises code quality: architecture, style, lint rules, moving onto shared
  tooling. Beside the type, never in its place. Not on a feature or fix that only passes through
  messy code.
- **`enabler`:** work that unblocks or speeds other work: review-tool and gate fixes, pre-push and
  test flakes, sync and CI fixes. Within one priority, `z-delivery` launches it first. Not on a fix
  that helps only its own issue.
- **`parked`:** only the owner sets it, and it keeps the issue out of Ready. When he parks or
  unparks in words, add or remove the label with a comment quoting him: `hq lanes promotable` reads
  only the label.

Add `quality` and `enabler` as you groom, and on a full pass to every open issue they fit. Create
any of these labels, ungrouped, when the team lacks it.

## Stale

- A Triage or Backlog issue is stale 14 days after `createdAt`. Not `updatedAt`: grooming moves it.
- An In Progress issue has stalled after 3 days with no activity on its PR or its agent's session.
  Step 5 handles both.
- In Review never stalls.
