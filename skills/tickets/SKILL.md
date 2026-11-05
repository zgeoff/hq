---
name: tickets
description:
  What a good Linear issue is in team GEO - its sections, when it is Ready, its fields, the Actions
  an agent may take, cross-repo and umbrella work, and how to save it. Load it before you write,
  rewrite, groom, split or save an issue, or judge whether one is Ready.
---

# Tickets

Write each issue so that an agent can build from it alone. A Ready issue is the brief of
the agent that builds it, and that agent has none of your context and may not be able to open
Linear. Put every fact it needs in the issue. Hand back each issue you saved, and whether it is
Ready.

Avoid these traps:

- An action the brief leaves out, which the agent then can't take.
- A follow-up that adds behaviour the owner never approved.
- A long save that a retry applies twice.

For the fleet's terms, such as `z-delivery` or a grant, see
[owner-calls](../owner-calls/SKILL.md#terms). To flag an issue is to add the `Needs Geoff` label and
a comment with the question, the options and your recommendation, as [linear-triage's Flagging
section](../linear-triage/SKILL.md#flagging) says.

## Key rules

- [Sections](#sections): Outcome, Context, Scope, Acceptance, Actions and Agent notes, in that
  order.
- [Ready](#ready): every section filled, blockers done, the work not done already, and no question
  left that only the owner can answer.
- [Larger work](#larger-work): read larger-work.md before you groom cross-repo work, an umbrella, a
  cleanup Chore or a document review.
- [Actions](#actions): write each action the agent may take in the brief, Code delivery included.
- [Save an issue](#save-an-issue): one `save_issue` call, a patch for a long description, and one
  check afterwards.

## References

- [fields.md](references/fields.md): type, size, priority, project, labels and staleness. Read it
  before you set or fix a field.
- [examples.md](references/examples.md): a Ready bug and a Ready design issue. Read it before you
  write one.
- [larger-work.md](references/larger-work.md): repo-wide and cross-repo work, umbrellas, cleanup
  Chores, and reviews of instruction documents. Read it before you write or groom one.

## Sections

Write each as a `##` heading, in this order. The Linear templates prefill them.

- **Outcome:** what becomes possible, and for whom, in 1–3 sentences. For a bug: what should happen,
  and what happens instead.
- **Context:** links and facts: the project, related issues, prior PRs, eval reports, decisions, and
  reproduction steps.
- **Scope:** `In:` and `Out:` lines. Put under `Out:` only what the issue, its comments or the
  request you file it from already exclude. Otherwise write `Out: none stated.`
- **Acceptance:** checkboxes, each a check plus the evidence the builder shows in its PR: a test, an
  eval run, a demo, a screenshot or a recording. The `evidence` skill says what counts as done for
  each type.
- **Actions:** what the agent may do, from [Actions](#actions).
- **Agent notes:** optional: the repo, branch, commands and pitfalls.

Then check these:

- For a change someone can see, name a screenshot or a recording as its evidence. The builder adds
  it to its PR with the `pr-evidence` skill.
- In a Design issue, write `## Questions to settle` in place of Scope. In an Investigation, write
  `## Questions to answer`.
- Write the title as the outcome, a plain lowercase phrase with no type prefix: "pick clone
  destination automatically during spawn".
- Before an Agent note asks the owner for a credential, run `op item list --vault <repo>`. Run it
  too for the shared vault that `tickets.private.md` names, in the hq-private checkout that
  `hq defs` shows. Name the item when it exists. Wait on the owner only for an item that is missing, or
  that sits in the owner's personal vaults. If you can't list a vault, say it's unchecked.
- An issue about Nix states the outcome and never scripts her: no fixed line, required wording or
  sign-off, and no Acceptance check on her exact words.
- In a follow-up or split issue, put only what the owner approved. Ask about a new behaviour the
  owner didn't request as a question of its own.

## Ready

An issue is Ready when all of these hold:

- Every section except the optional Agent notes is filled, and Acceptance has at least one check
  with evidence.
- Each blocker is Done, or all its PRs have merged in this issue's repo and this issue needs nothing
  that ships only on their release. When you move the issue to Ready, add a comment that says which,
  for each blocker.
- Whatever an Acceptance item tests exists, or this issue builds it, or a linked blocker does. If
  the text says it waits on another stage or slice, link that issue as a blocker first.
- The work isn't done already: no merged PR is attached, and `hq run show GEO-<n>` shows no run at
  `merged`, `live-check` or `done`. Set an issue with a merged PR, or a run at `merged` or
  `live-check`, to In Review. Set one with a `done` run to Done.
- One agent can do it, in one or more PRs. Split it into sub-issues only when the parts ship on
  their own.

Each type also needs:

- **Bug, Feature, Improvement, Chore:** no question that only the owner can answer. If one remains,
  set Backlog and flag it.
- **Design:** the questions listed, and Context linking what the session needs.
- **Investigation:** the questions listed, each with the decision it informs.

Whatever else holds, keep an issue out of Ready when it has the `parked` label, which only the owner
sets, or when it is a nixie slice (a stage of the nixie plan, see [fields.md](references/fields.md))
that the owner hasn't yet planned into sub-issues.

A missing project doesn't block Ready. Set one as the Project section in fields.md says.

Feature work in zgeoff/vers, the game repo, stays in Backlog: any vers Feature or Design issue, and
any vers issue that changes game design or player experience. Groom and flag it as usual. Other vers
issues, such as bugs, chores, rollouts and code quality, follow the normal rules. When unsure, treat
it as feature work and flag it.

## Larger work

Read [larger-work.md](references/larger-work.md) before you write or groom repo-wide or cross-repo
work, an umbrella, a cleanup Chore, or a review of an instruction document.

## Actions

Name each action in the brief. The agent's auto-mode classifier might refuse any action beyond
Code delivery that the brief leaves out. Read `tickets.private.md` for the rest of the reason.

Write each Action, and leave its approval to `z-delivery`. Before a launch, it sends the
[pitch](../delivery-lead/SKILL.md#pitches) for the Actions that
[owner-calls](../owner-calls/SKILL.md#what-only-the-owner-decides) lists as the owner's, and
launches with the rest. Flag an issue for an Action only where its form below says so.

Write one line per action, in these forms.

- **Code delivery:** write `Code delivery` on every Bug, Feature, Improvement and Chore. It covers
  the agent's own checkout, installs, tests and evals, commits, pushing and force-pushing its branch
  with `--force-with-lease`, and a ready PR.
- **Credentials:** `Credentials: <vault or environment> — <each named credential>`.
- **Paid API:** `Paid API: <API> for <purpose>, limit <spend or quantity>`. Flag the issue only when
  its limit is over $5 of pay-per-use spend, or over $50 of the owner's Claude subscription.
- **Deployment:** `Deploy: <environment>, <when, such as after CI passes on main>`.
- **Infrastructure:** `Infra: <resources or stack>`.
- **Data:** `Data: <datastore>, <migration, backfill, …>`. For one that only adds data, as
  owner-calls defines it, write `insert-only` and `after a backup` in the line, such as
  `Data: garden db, insert-only copy of old seed counts, after a backup`. It needs no pitch unless
  it touches another owner-calls item, such as Nix's memory.
- **Posting:** `Post: <where, such as issues on zgeoff/atc>`. A vendor support question goes out
  under the owner's name: `Post: draft for the owner to send to <vendor> support`.
- **Linear edits:** `Linear: <documents, milestones or issues>`. `z-delivery` makes these edits
  itself, and they change no repo, except an edit owner-calls lists, such as a new project.
- **Design session:** `Design session, then the decision record as a Linear document`. It is the
  default for Design. The owner joins only with `with-geoff`. Nothing goes into a repo.

## Save an issue

- For an issue filed from a design record, make the description's first line `From design <link>,
  decisions <n>[, <n>]`, so that [inflow.sh](../linear-triage/scripts/inflow.sh) counts it as
  planned. Add the line when you groom a design-filed issue that lacks it.
- In that issue's Scope, copy what those decisions settled, word for word: every code block, name,
  value and example. When a later decision changes it, edit the description. Never add an amending
  comment.
- Save each issue in one `save_issue` call. Under about 3,000 characters, send the description
  whole. Longer, send a `patch` of `replace` or `replace_range` edits anchored on current text,
  never `append`, `prepend` or `insert_*`, so that a retry can't add text twice.
- A save that sets only fields, such as labels, project, priority, state or relations, sends just
  those fields.
- `save_issue` can misreport. After one save, or a run of saves such as a linear-triage pass, list
  the issues updated since the first save, once. Retry only a save whose change isn't there.

**Reply:** each issue you saved, its state, and for one not Ready, what keeps it out.
