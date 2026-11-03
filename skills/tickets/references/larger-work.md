# Larger work

Work bigger than one change in one repo needs its own Scope and Acceptance. That covers a repo-wide
rule change, a change that rolls out to several repos, the cleanup Chore that ends a project, and a
review of an instruction document. To flag an issue here means what the
[tickets skill](../SKILL.md) says.

Avoid these traps:

- Filing a new issue for a defect that a repo-wide change meets outside its scope. The builder fixes
  it in the same PR.
- Closing a project before its cleanup Chore is done.
- Merging a PR that changes a repo's `AGENTS.md` or skills before the owner reviews it.

## Repo-wide and cross-repo work

- For a repo-wide rule change, such as a lint rollout or a layout change, write into Scope the rules
  it applies, linked at a pinned zgeoff/tools tag, and the files or areas they cover.
- Also write into Scope that the builder fixes, in the same PR, any defect it meets outside those
  files or areas, and files no issue for it.
- For a new lint rule, write into Scope that the builder turns the rule on in the PR that adds it,
  and fixes what the rule flags.
- A change that rolls out to several repos gets one umbrella issue. Its Scope is a checklist with a
  box per repo. Its Acceptance is every box ticked, each by a merged PR in that repo. Each PR says
  `Contributes to GEO-<n>`. On each merge, `z-review` ticks the box, and on the last box it settles
  the umbrella's state, as [pr-review](../../pr-review/SKILL.md#after-the-merge) says.
- A part in zgeoff/vers that is feature work, as [Ready](../SKILL.md#ready) defines it, stays its
  own Backlog issue, related to the umbrella.
- When you groom one repo's part of a shared change, search for the same change in other repos. Make
  the oldest issue the umbrella, with a box per repo, and mark the others Duplicate. The
  `linear-triage` session also looks for duplicates already past Triage in its pass.
- A refactor, migration or architecture project ends with a cleanup Chore, blocked by every other
  open issue in the project. File one if it's missing. When you groom a new issue in the project,
  add it as a blocker of the cleanup Chore. The Chore's Scope lists each temporary piece the move
  added:
  - maps, wave or move scripts, and codemods;
  - compat shims and cutover flags;
  - knip or lint exceptions.

  Its Acceptance is one `git grep -n <name>` per piece on `main` that finds nothing. `<name>` is
  what the piece goes by in code, such as a script's file name, a flag or a rule ID. The project
  isn't Done until the cleanup Chore is.

## Reviews of instruction documents

A PR that changes a repo's `AGENTS.md` or skills waits for the owner's review, except in
zgeoff/nixie-definitions. When you see such a PR open, flag its issue, with the PR's link.
`z-review` merges the PR on the owner's lgtm. For a review PR of any other document, flag its issue
only when the owner asks.

For a review of an `AGENTS.md`, a doc or a skill, write these into Scope:

- Go through it once, and keep, cut or rewrite each item.
- Write a check, in the same PR, for each kept item that a machine could check. File it separately
  only when it belongs in another repo.
- Rewrite each list that the document runs into a sentence as bullets.
- Open one PR per document, with the reason for each keep, cut or rewrite in the PR description.
