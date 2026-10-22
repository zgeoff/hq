# fields

Read this before you set or correct a field.

Every open issue has one project, one type, one priority, and one or more area labels. Every issue except a Design, an Investigation, or a parent with sub-issues also has a size.

**Type** (the `Type` label group):

| Type          | The issue                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------- |
| Bug           | fixes behaviour that's wrong                                                                |
| Feature       | makes something possible that wasn't                                                        |
| Improvement   | makes something that exists work better for the people who use it                           |
| Chore         | does upkeep that changes nothing a user of the repo notices: lint rollouts, syncs, pins, CI |
| Design        | settles questions with the owner in a design session                                        |
| Investigation | answers questions with evidence, to inform a decision                                       |

The line between Improvement and Chore: ask whether anyone who uses the repo or the product would notice the change. A new lint rule, an `AGENTS.md` sync or a version pin is a Chore. A faster command or a clearer error is an Improvement. An issue that delivers a design note by PR is a Design when the note decides something for the owner, such as game design, product scope or policy: those keep him in the loop, so its Action is a design session, never `Code delivery`. It is an Investigation only when an agent can settle it from evidence alone, such as a measurement or a comparison of libraries. It is never an Improvement. Correct a type that's set when the table plainly says otherwise, and comment the old type and the reason. Save the labels without the old type label, since the Type group takes one. When it's a close call, leave it.

**Size** (the `Size` label group). **Delivery** routes work to a model by size and builds L and XL as a stack. Size by the lines the change needs, tests included, and write your guess in the comment, such as "L, about 3,000 lines":

| Size | The work                                               |
| ---- | ------------------------------------------------------ |
| S    | under 500 lines, in one repo and one area              |
| M    | 500 to 2,000 lines, in one repo                        |
| L    | 2,000 to 5,000 lines, in one repo or in natural layers |
| XL   | over 5,000 lines, or crosses several repos             |

A change to how auth, secrets, money, migrations that change or delete existing data, deletion or infra permissions behave is at least L, whatever its lines. Code that only moves or renames around them, or a migration that only adds a table, a column or an index, takes the size of its lines.

A nixie slice issue, titled "Slice <n>: …", is planned with the owner, so don't split it yourself: size it XL, and leave it out of Ready until its slice is planned into sub-issues. Record a blocker named by slice number as a relation to its slice issue, using GEO-536 and the GEO-527 decision record for the order since the reorder, never the old numbers.

An issue may take several PRs, such as a stack for one change or one PR in each repo it crosses. Size the whole issue. Split it into sub-issues before Ready only into separate outcomes, each with its own acceptance, never for size alone; then the parent takes no size. Split an XL only at a natural seam, where each part ships and helps on its own. Never split a change that must land together, such as a migration and the code that reads it.

**Priority** (Linear's own field). Set it from the table when it's missing. Never change a priority that's already set: when the table disagrees with it, flag the issue with `Needs Geoff` and propose the change, unless the issue quotes the owner choosing that priority. Then keep it, and flag nothing. Keep Urgent and High narrow: when everything is High, nothing is.

| Priority | The issue                                                                                                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Urgent   | is broken and blocks other work, or exposes a secret, or a security hole that something running today can reach. A hole that nothing can reach yet is High: note in a comment what would make it reachable              |
| High     | sits on the critical path of an active project, or has a deadline its text states within the next 14 days, or is a small change that helps the owner evaluate the system as he uses it, such as a nixie context counter |
| Medium   | is committed work with no date pressure                                                                                                                                                                                 |
| Low      | is nice to have                                                                                                                                                                                                         |

**Project.** A project holds an outcome, and its issues are the slices. Set a project to In Progress when one of its issues is In Progress or In Review, and comment why: its status is a fact about its work, not a decision. Judge High against that status. Never move a project back, pause it or complete it. Put each issue in the project whose outcome it serves. Upkeep that serves no outcome, such as Chores and small Bugs, goes in its area's `<area> maintenance` project. A feature or design that serves no outcome project goes in its area's `<area> roadmap` project; create that project when the area has none. When several issues in a roadmap project share an outcome, propose a project of their own. When an area has none, or the work needs a new outcome, flag one issue of the cluster with `Needs Geoff` and propose the project once, listing the other issues in the comment.

**Area** (one or more): the repo or system the work lands in, as one of the team's ungrouped labels other than `Needs Geoff`, `quality`, `enabler` and `process`, such as `atc` or `auto-mode`. List the labels once per pass to see them. When no area label fits, create one named after the repo.

**Quality.** Add the `quality` label to an issue whose work raises code quality: architecture, code style, lint rules, or moving a repo onto the stack baseline. It sits beside the issue's type and area, never in place of them, so a lint rollout is still a Chore with its area label. Leave it off a feature or a bug fix that only touches messy code on the way. Add it as you groom each issue, and on a full pass to each open issue it fits. Create the label, ungrouped, when the team has none.

**Enabler.** Add the `enabler` label to an issue whose work unblocks or speeds up other work, such as review-tool and gate fixes, pre-push and test flakes, sync and CI fixes, and the GEO-1540 alignment rollouts. It changes no priority: within one priority, **Delivery** launches an `enabler` issue ahead of a one-off fix. Leave it off a fix that helps only its own issue. Add it as you groom each issue, and on a full pass to each open issue it fits. Create the label, ungrouped, when the team has none.

**Parked.** Only the owner adds or removes the `parked` label. An issue that carries it stays out of Ready whatever its priority, so leave it in Backlog. Groom it like any other.

**Stale.** An issue is stale when it's In Progress with no PR or agent session activity for 3 days, or in Triage or Backlog with no update for 14 days. In Review isn't stale: it waits on a merge.
