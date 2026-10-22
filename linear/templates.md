# linear issue templates

Source for the `GEO` team's issue templates. Each template sets its Type label and prefills the description below; paste changes into Linear when this file changes.

Every type shares the same sections so a Ready issue doubles as an agent brief. The Acceptance prompts differ by type because each type has its own finish line.

## Bug

Label: `Bug`

```markdown
## Outcome

What should happen, for whom, and what happens instead.

## Context

Steps to reproduce, logs or screenshots, related issues and PRs.

## Scope

In:
Out:

## Acceptance

- [ ] The reproduction steps no longer produce the fault
- [ ] A regression test or eval case covers it

## Actions

Code delivery

## Agent notes
```

## Feature

Label: `Feature`

```markdown
## Outcome

What becomes possible, and for whom. 1–3 sentences.

## Context

Project, related issues, prior PRs, design decisions.

## Scope

In:
Out:

## Acceptance

- [ ] Observable check, with the evidence that proves it (test, eval run, screenshot, demo)

## Actions

Code delivery

## Agent notes
```

## Improvement

Label: `Improvement`

```markdown
## Outcome

What gets better, and how you'd notice.

## Context

Related issues, PRs, measurements.

## Scope

In:
Out:

## Acceptance

- [ ] The improvement, with evidence (measurement, before/after)
- [ ] Existing behaviour unchanged except where intended

## Actions

Code delivery

## Agent notes
```

## Chore

Label: `Chore`

```markdown
## Outcome

What upkeep gets done, such as a lint rollout, a sync or a version pin.

## Context

Related issues and PRs, and the repos it touches.

## Scope

In:
Out:

## Acceptance

- [ ] The upkeep is done in each repo in scope
- [ ] Checks pass, and nothing a user of the repo notices changed

## Actions

Code delivery

## Agent notes
```

## Design

Label: `Design`

```markdown
## Outcome

What decision this unlocks, and which work waits on it.

## Context

The problem, constraints, prior attempts, references to compare against.

## Questions to settle

-

## Acceptance

- [ ] Decisions recorded in a Linear document
- [ ] Follow-up issues filed and linked

## Actions

Design session with Geoff, then the decision record as a Linear document

## Agent notes
```

## Investigation

Label: `Investigation`

```markdown
## Outcome

What we need to know, and what decision it informs.

## Context

What's known so far, where to look.

## Questions to answer

-

## Acceptance

- [ ] Findings written up with evidence (where:)
- [ ] A recommendation, with follow-up issues filed if any

## Actions

## Agent notes
```
