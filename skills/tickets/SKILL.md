---
name: tickets
description:
  What a good Linear issue is in team GEO - its sections, when it is Ready, its fields, the Actions
  an agent may take, cross-repo and umbrella work, and how to save it. Load it before you write,
  rewrite, groom, split or save an issue, or judge whether one is Ready.
---

# Tickets

A Ready issue is the brief of the agent that builds it, and that agent has none of your context and
may not be able to open Linear. Put every fact it needs in the issue.

## References

- [fields.md](references/fields.md): type, size, priority, project, labels and staleness. Before you
  set or fix a field.
- [examples.md](references/examples.md): a Ready bug and a Ready design issue. Before you write one.

## Sections

In this order; the Linear templates prefill them.

| Section     | What goes in it                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| Outcome     | What becomes possible, and for whom, in 1–3 sentences. A bug: what should happen, and what happens instead. |
| Context     | Links and facts: project, related issues, prior PRs, eval reports, decisions, reproduction steps.           |
| Scope       | `In:` and `Out:` lines. `Out:` only what the issue already excludes, or `Out: none stated.`                 |
| Acceptance  | Checkboxes, each a check plus its evidence: a test, an eval run, a screenshot, a demo.                      |
| Actions     | What the agent may do, from [Actions](#actions).                                                            |
| Agent notes | Optional: repo, branch, commands, pitfalls.                                                                 |

- A Design issue replaces Scope with `## Questions to settle`; an Investigation with
  `## Questions to answer`.
- Title: the outcome as a plain lowercase phrase, with no type prefix: "pick clone destination
  automatically during spawn".
- Before an Agent note asks the owner for a credential, run `op item list --vault <repo>`, and the
  same for the shared vault `tickets.private.md` names. Name the item when it exists. Only a missing
  item, or one in his personal vaults, waits on him. If you can't list a vault, say it's unchecked.
- An issue about Nix states the outcome and never scripts her: no fixed line, required wording or
  sign-off, and no Acceptance check on her exact words.
- A follow-up or split issue carries only what the owner approved. A new behaviour he didn't ask for
  goes to him as its own question.

## Ready

All of these hold:

- Every section is filled, and Acceptance has at least one check with evidence.
- Each blocker is Done, or all its PRs have merged in this issue's repo and this issue needs nothing
  that ships only on their release. Say which, per blocker, in the Ready comment.
- Whatever an Acceptance item tests exists, or this issue builds it, or a linked blocker does. If
  the text says it waits on another stage or slice, link that issue as a blocker first.
- The work isn't done already: no merged PR attached, and `hq run show GEO-<n>` shows no run at
  `merged`, `live-check` or `done`. A merged PR or a run at `merged` or `live-check` moves it to In
  Review; a `done` run moves it to Done.
- One agent can do it, in one or more PRs. Split it into sub-issues only when the parts ship on
  their own.

| Type                             | Also needs                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Bug, Feature, Improvement, Chore | no question only the owner can answer; if one remains, Backlog, `Needs Geoff` and a comment |
| Design                           | the questions listed, and Context linking what the session needs                            |
| Investigation                    | the questions listed, each with the decision it informs                                     |

Two things keep an issue out of Ready whatever else holds: the `parked` label, which only the owner
sets, and a nixie slice not yet planned with the owner into sub-issues.

- A missing project doesn't block Ready. Flag it as fields.md's Project rule says.
- vers feature work stays in Backlog: any vers Feature or Design issue, and any vers issue that
  changes game design or player experience. Groom and flag it as usual. Other vers issues (bugs,
  chores, rollouts, code quality) follow the normal rules. When unsure, treat it as feature work and
  flag it.

## Larger work

What counts as done for each type is in the `evidence` skill.

### Repo-wide and cross-repo work

- A repo-wide rule change (a lint rollout, a layout change) names the rules at a pinned zgeoff/tools
  tag in Scope, with the files or areas. A defect outside that scope is fixed in the same PR, never
  filed.
- The PR that adds a lint rule turns it on and fixes what it flags. Write that into Scope.
- A change that rolls out to several repos gets one umbrella issue: a Scope checklist with a box per
  repo, Acceptance every box ticked. Each PR says `Contributes to GEO-<n>`, and `z-review` ticks the
  box on merge. A vers part that is feature work stays its own Backlog issue, related to the
  umbrella.
- Grooming one repo's part of a shared change: search for the same change in other repos, make the
  oldest the umbrella with a box per repo, and mark the others Duplicate. Step 6 finds the ones past
  Triage.
- A refactor, migration or architecture project ends with a cleanup Chore, blocked by every other
  open issue in the project. File one if it's missing. Its Scope lists each temporary piece the move
  added:
  - maps, wave or move scripts, and codemods;
  - compat shims and cutover flags;
  - knip or lint exceptions.

  Its Acceptance is one `git grep -n <name>` per piece on `main` that finds nothing. The project
  isn't Done until it is.

### Reviews of instruction documents

For a review of an `AGENTS.md`, a doc or a skill, write into Scope:

- Go through it once, and keep, cut or rewrite each item.
- Write a check for each kept item a machine could check, in the same PR. File it separately only
  when it belongs in another repo.
- Write lists as bullets.
- One PR per document, with the reason for each keep, cut or rewrite in the PR description.

A PR that changes a repo's `AGENTS.md` or skills waits for the owner's review, except in
zgeoff/nixie-definitions. When you see one open, flag its issue with the PR's link; `z-review`
merges on his lgtm. Flag a review of any other document only when he asks.

## Actions

Each action beyond Code delivery is one the agent's auto-mode classifier might refuse, so it goes in
the brief. The owner approves them when he approves the pitch. `tickets.private.md` in hq-private
(`hq defs` shows where) says why they must be in the brief.

| Action         | Write it as                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code delivery  | `Code delivery`, the default for Bug, Feature, Improvement and Chore: its own checkout, installs, tests and evals, commits, pushing and force-pushing its branch with `--force-with-lease`, a ready PR. |
| Credentials    | `Credentials: <vault or environment> — <each named credential>`                                                                                                                                         |
| Paid API       | `Paid API: <API> for <purpose>, limit <spend or quantity>`                                                                                                                                              |
| Deployment     | `Deploy: <environment>, <when, such as after CI passes on main>`                                                                                                                                        |
| Infrastructure | `Infra: <resources or stack>`                                                                                                                                                                           |
| Data           | `Data: <datastore>, <migration, backfill, …>`                                                                                                                                                           |
| Posting        | `Post: <where, such as issues on zgeoff/atc>`. A vendor support question goes out under the owner's name: `Post: draft for the owner to send to <vendor> support`.                                      |
| Linear edits   | `Linear: <documents, milestones or issues>`. No repo change; `z-delivery` makes these edits itself.                                                                                                     |
| Design session | `Design session, then the decision record as a Linear document`, the default for Design. The owner joins only with `with-geoff`. Nothing goes into a repo.                                              |

Paid API limits: $5 of pay-per-use spend, or $50 of the owner's Claude subscription. Flag only a
higher limit.

## Saving an issue

- An issue filed from a design record starts with `From design <link>, decisions <n>[, <n>]`, so
  `scripts/inflow.sh` counts it as planned. Its Scope carries what those decisions settled, word for
  word: every code block, name, value and example. A later decision edits the description, never
  adds an amending comment. Add the line when you groom a design-filed issue that lacks it.
- Save each issue in one `save_issue` call. Under about 3,000 characters, send the description
  whole. Longer: send a `patch` of `replace` or `replace_range` edits anchored on current text,
  never `append`, `prepend` or `insert_*`, so a retry can't add text twice.
- A save that sets only fields (labels, project, priority, state, relations) sends just those
  fields.
- `save_issue` can misreport. After the pass's saves, list the issues updated since the pass
  started, once, and retry only a save whose change isn't there.
