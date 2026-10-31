# Example tickets

Shape and detail only; the specifics are invented.

## A Ready bug

```markdown
Title: reject probability tables that don't sum to 1

## Outcome

The classifier config loader should reject a probability table whose values don't sum to 1, so a
typo can't silently skew decisions. Today it loads the table and normalises nothing.

## Context

- Project: auto-mode
- Found during the threshold eval run (link to report)
- Loader: `src/config/load-thresholds.ts` in zgeoff/auto-mode

## Scope

In: validation at load time, with an error naming the table and its sum. Out: changing any existing
threshold values.

## Acceptance

- [ ] Loading a table that sums to 0.97 fails with an error naming the table and the sum (unit test)
- [ ] All shipped configs still load (existing test suite passes)

## Actions

Code delivery

## Agent notes

Tolerance of 1e-9 matches the eval harness.
```

## A Ready design issue

```markdown
Title: redesign the decision model around usable autonomy

## Outcome

The owner can leave an agent working end to end, and most tasks finish with no intervention.
Decisions block with a reason and let the agent continue, and only catastrophic actions stop work
outright.

## Context

- Project: auto-mode
- Current eval reports (links)
- Premise from the owner: risk is a trade-off against usability; catastrophic failures are a
  different class from risk.

## Questions to settle

- What counts as catastrophic, and how is it detected?
- How is a task's scope established, and how does consent to go beyond it work?
- What does the agent see when it's blocked, and how does it continue?

## Acceptance

- [ ] Decisions recorded in a Linear document on this issue
- [ ] Follow-up issues filed and linked, each with Outcome and Acceptance

## Actions

Design session, then the decision record as a Linear document
```
