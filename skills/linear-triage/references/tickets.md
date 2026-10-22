# tickets

A Ready issue doubles as the agent's brief, so write it for an agent with no context: it can't see your chat with the owner, and it may not be able to open Linear at all.

Contents: [sections](#sections) · [Ready](#ready) · [finish line by type](#finish-line-by-type) · [Actions](#actions) · [saving an issue](#saving-an-issue) · [examples](#examples)

## sections

Every issue uses these sections in this order. The Linear templates prefill them.

| Section     | What goes in it                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Outcome     | What becomes possible, and for whom, in 1–3 sentences in the owner's words. For a bug: what should happen and what happens instead.                                                                                                                                                                                                                                                                               |
| Context     | Links and facts the agent needs: project, related issues, prior PRs, eval reports, decisions, reproduction steps.                                                                                                                                                                                                                                                                                                 |
| Scope       | `In:` and `Out:` lines. Write an `Out:` line only from what the issue states; when it states no exclusion, write `Out: none stated.` Design and Investigation issues use "Questions to settle" or "Questions to answer" instead.                                                                                                                                                                                  |
| Acceptance  | Checkboxes, each an observable check plus the evidence that proves it (a test, an eval run, a screenshot, a demo).                                                                                                                                                                                                                                                                                                |
| Actions     | Everything the agent must be allowed to do (catalogue below).                                                                                                                                                                                                                                                                                                                                                     |
| Agent notes | Optional gotchas: repo and branch, commands, known pitfalls. Before a note puts a credential step on the owner, run `op item list --vault <repo>` and the same for the shared vault this file's private half names, and name the item when one exists; only a missing item, or one in his personal vaults, waits on him. When you can't list a vault, write that it is unchecked, never that the item is missing. |

For a nixie issue, never script Nix's replies or force a behaviour on her: no fixed line, required wording, forced closer, or rule that she must make an offer. State the outcome, and leave what she says to her. No Acceptance check tests her exact wording.

A follow-up or split issue carries only what the owner approved. A new behaviour he didn't ask for, such as an offer Nix makes, goes to him as its own question, never as part of another question's answer.

Title the issue with the outcome as a plain lowercase phrase ("pick clone destination automatically during spawn"). The type label carries the type, so leave prefixes like "Bug:" out of the title.

## Ready

Move an issue to Ready when all of these hold:

- Every section is filled in, and Acceptance has at least one check with its evidence.
- Every blocking issue is Done, or every PR of it has merged in the repo this issue builds in, and this issue needs nothing the blocker's release adds. Name which in the Ready comment.
- What its Acceptance exercises beyond the issue's own work exists, or the issue that builds it is linked as a blocker. When the text says it waits on a later stage or a slice, link that issue as a blocker first.
- Its work isn't already done: no merged PR is attached, and `hq run show <issue>` shows no run at `merged`, `live-check` or `done`. When one is, move the issue to In Review instead, or to Done for a done run.
- The work fits one agent. It may take several PRs; split it into sub-issues under the same project only when its parts can ship on their own.

Leave an issue with the `vers` area label in Backlog: the owner picks which vers issues reach Ready, and a vers issue in Ready launches. Groom its fields and flag its questions as usual, and leave it in Backlog.

A missing project doesn't hold an issue back from Ready. Flag the project question as the Project rule in `fields.md` says.

Each type adds one condition:

| Type                             | Also Ready when                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bug, Feature, Improvement, Chore | No question only the owner can answer remains. If one does, keep it in Backlog, give it `Needs Geoff`, and comment the question.                    |
| Design                           | The questions to settle are listed and the Context links the material the session needs. Open questions for the owner are the point of the session. |
| Investigation                    | The questions to answer are listed and each one says what decision it informs.                                                                      |

## finish line by type

| Type          | Done when                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bug           | the reproduction no longer fails, and a regression test or eval case covers it                                                                   |
| Feature       | every acceptance check passes with its evidence                                                                                                  |
| Improvement   | the improvement is shown with evidence, and existing behaviour is unchanged except where intended                                                |
| Chore         | the upkeep is done, and checks show nothing a user notices changed; no live-check item unless it publishes an artifact or rolls out across repos |
| Design        | decisions are recorded in a Linear document, and follow-up issues are filed                                                                      |
| Investigation | findings and a recommendation are written up, with follow-up issues if any                                                                       |

A sweep applies a rule across a repo, such as a lint rollout or a layout change. Its Scope names the rules it applies, at a pinned zgeoff/tools tag, and the files or areas in scope. Its Acceptance says when it is done. A defect found outside that scope is fixed in the sweep's PR under the delivery brief's rule, never as another round on this ticket.

A shared change that rolls out to several repos, such as a zgeoff/tools lint release, a sync, or a shared rule, gets one umbrella issue, never one issue per repo. Its Scope holds a checklist with one box per repo, and its Acceptance is every box ticked. Each repo's PR names it as `Contributes to GEO-<n>`, and `z-review` ticks that repo's box when it merges the PR. A vers part stays out: keep it as its own issue in Backlog, related to the umbrella, so the owner still picks which vers work reaches Ready. When you groom a Triage issue that is one repo's part of a shared change, search the open issues for the same change in other repos: make the oldest non-vers issue the umbrella, with a box for each repo but vers, and mark the others Duplicate of it. The overlap check's `--rollouts` run finds the ones already past Triage.

Every refactor, migration or architecture project ends with a cleanup issue that removes the project's own scaffolding (decision D-cleanup-issue). When such a project has none, file it: a Chore in that project, blocked by every other open issue in it, so it launches last. Its Scope lists each artefact the project added for the move: maps, wave or move scripts, codemods, compat shims, cutover flags, and knip or lint exceptions kept for the migration. Its Acceptance is one search per artefact on `main`, such as `git grep -n <name>`, that finds nothing. The project is not Done until this issue is Done.

The PR that adds a lint rule turns it on in its own repo and fixes it there; it never turns the rule off there. Write this into its Scope.

A pass over an instruction document, such as an `AGENTS.md`, a doc or a skill, is one pass: keep or cut each item. When a machine could check a kept item, write the check in the same PR when it belongs in the same repo, and file it as its own ticket only when it belongs in another repo. Write lists as bullets, such as one bullet per check, with its command and where its rules live. Each document gets its own PR, with the reason to keep, cut or rewrite each item in its description. A PR that changes a repo's `AGENTS.md` or its skills waits for the owner's review, except in zgeoff/hq and zgeoff/nixie-definitions, so flag its ticket for his review with the PR's link; `z-review` merges it once he says lgtm. Flag a pass over any other document only when he asks.

## Actions

The Actions section lists every action the agent needs that an auto-mode classifier might block. `agent-delegation` copies these into the brief, and the owner's approval of the pitch approves them. Why they must be in the brief is in this file's private half: read `skills/linear-triage/references/tickets.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill.

| Action                 | Write it as                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Code delivery          | `Code delivery`: default for Bug, Feature, Improvement, Chore. Covers working in its own checkout, installing dependencies, running tests and evals, committing, pushing its branch, rebasing it onto `main` and force-pushing it with `--force-with-lease`, and opening a ready PR. |
| Credential access      | `Credentials: <vault or environment> — <each named credential>`                                                                                                                                                                                                                      |
| Paid API usage         | `Paid API: <API> for <purpose>, limit <spend and/or quantity>`                                                                                                                                                                                                                       |
| Deployment             | `Deploy: <environment>, <when, e.g. after CI passes on main>`                                                                                                                                                                                                                        |
| Infrastructure changes | `Infra: <resources or stack>`                                                                                                                                                                                                                                                        |
| Data changes           | `Data: <datastore>, <migration, backfill, …>`                                                                                                                                                                                                                                        |
| External communication | `Post: <where, e.g. issues on zgeoff/atc>`. A question to a vendor's support goes out under the owner's name, so the agent drafts it into the issue and the owner sends it: `Post: draft for the owner to send to <vendor> support`.                                                 |
| Linear edits           | `Linear: <documents, milestones or issues to edit>`. No repo change. **Delivery** makes these edits itself rather than launching an agent.                                                                                                                                           |
| Design session         | `Design session with the owner, then the decision record as a Linear document`: default for Design. The agent works through the design with the owner, writes the decision record, and files and links its follow-up issues; nothing goes into a repo.                               |

Write the Paid API limit as $5 in API money, or up to $50 when it runs on the owner's Claude subscription, unless the work needs more. Flag with `Needs Geoff` only a limit above those.

## saving an issue

An issue filed from an agreed design record, such as a decision's follow-up, rollout or umbrella, starts its description with `From design <the record's link>`, so the inflow line counts it as planned. When you groom a Triage issue that a design session filed without it, add it.

Save each issue once. Save a description under about 3,000 characters whole. For a longer one, send a `patch` of `replace` or `replace_range` edits only, each anchored on text the issue holds now, so a retry that finds its anchor gone changes nothing; never `append`, `prepend` or `insert_*`, since a retry would add the text twice. Don't trust the save's reply. After the batch, list the issues updated since the pass's start once, and retry only a save that list shows didn't apply. A save that sets only fields (labels, project, priority, state, relations) needs no description: send just those fields. Grooming a Triage issue and completing an incomplete one save the same way.

## examples

The two examples below show shape and level of detail. Their file paths and specifics are illustrative, so check the real issue and repo.

### a Ready bug

```markdown
Title: reject probability tables that don't sum to 1

## Outcome

The classifier config loader should reject a probability table whose values don't sum to 1, so a typo can't silently skew decisions. Today it loads the table and normalises nothing.

## Context

- Project: auto-mode
- Found during the threshold eval run (link to report)
- Loader: `src/config/load-thresholds.ts` in zgeoff/auto-mode

## Scope

In: validation at load time, with an error naming the table and its sum.
Out: changing any existing threshold values.

## Acceptance

- [ ] Loading a table that sums to 0.97 fails with an error naming the table and the sum (unit test)
- [ ] All shipped configs still load (existing test suite passes)

## Actions

Code delivery

## Agent notes

Tolerance of 1e-9 matches the eval harness.
```

### a Ready design issue

```markdown
Title: redesign the decision model around usable autonomy

## Outcome

The owner can leave an agent working end to end, and most tasks finish with no intervention. Decisions block with a reason and let the agent continue, and only catastrophic actions stop work outright.

## Context

- Project: auto-mode
- Comparison with Anthropic's auto mode: GEO-94
- Current eval reports (links)
- Premise from the owner: eliminating risk is impossible; usability is key; risk is a trade-off; catastrophic failures are a different class from risk.

## Questions to settle

- What counts as catastrophic, and how is it detected?
- How is a task's scope established, and how does consent to go beyond it work?
- What does the agent see when it's blocked, and how does it continue?

## Acceptance

- [ ] Decisions recorded in a Linear document on this issue
- [ ] Follow-up issues filed and linked, each with Outcome and Acceptance

## Actions

Design session with the owner, then the decision record as a Linear document
```
