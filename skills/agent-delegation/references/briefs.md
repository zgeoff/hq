# briefs

Where an agent's permissions are granted, and how to word the launch prompt and every grant, is in
this file's private half: read `skills/agent-delegation/references/briefs.private.md` in the local
hq-private clone (`hq defs` shows where it is) and follow it as part of this skill.

An agent stays inside the 1Password token scope it was given, because each repo's token reaches
only that repo's vault.

## The delivery brief

The template is [templates/brief.md](../templates/brief.md). hq renders it for each Ready issue it
launches; fill it the same way for a relaunch or a pitch launch. Each placeholder holds:

| Placeholder        | What goes in                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `{{repo}}`         | `zgeoff/<repo>`                                                                                                                                              |
| `{{issue_id}}`     | `GEO-n`                                                                                                                                                      |
| `{{issue}}`        | The issue's Outcome, Context, Scope, Acceptance and Agent notes                                                                                              |
| `{{permissions}}`  | One permission phrase per approved action, from the private half; a standard launch carries Code delivery only                                               |
| `{{stack}}`        | For an L or XL issue, the stack line below; otherwise empty                                                                                                  |
| `{{fixes}}`        | `Contributes to` when a release, install, image build, deploy or live check remains after the merge; `Fixes` only when the merge meets every acceptance item |
| `{{review_lines}}` | The text block in the noslop-brief reference for a repo `hq noslop` lists; otherwise empty                                                                   |
| `{{not_yours}}`    | For each acceptance step the agent can't do, such as a live run: ` <step> is not yours; it runs after the merge.`                                            |
| `{{imp_line}}`     | On a cloud imp, the imp line below; otherwise empty                                                                                                          |
| `{{goal_file}}`    | Empty, or `. The full issue is in <path>; read it first.` when the issue moves to a file                                                                     |

For an issue that takes several PRs, name each PR in `{{issue}}`'s Scope, and the finish line is the
last one ready, with each earlier one merged or ready.

The stack line:

```text
Build this as a stack with the gh-stack skill, one reviewable layer per PR. Keep it current with `gh stack sync` rather than a rebase of one layer, and review each layer as the finish line says, with `--base <its parent branch>`.
```

The imp line:

```text
Lint, format and other light checks run in lefthook's pre-commit and pre-push hooks. Defer to CI for larger checks. This imp has 2 GiB: stop each sub-agent when its part is done, and end each test or build process before you start the next.
```

## Length

The `/goal` line states the finish line, not the outcome, because an outcome only a live run proves
keeps the goal checker looping. A `/goal` launch prompt holds at most 4,000 characters. For a longer
brief:

1. Put the pasted issue in a file in the agent's checkout, and set `{{goal_file}}`. Keep the
   Permissions block, the finish line and the note line in the prompt, because a permission in a
   file never reaches the classifier.
2. Without such a file, cut Context and Agent notes first, and keep Outcome, Scope and Acceptance
   whole.
3. When it is still too long, drop the `/goal` line; the finish line holds the goal.

## Messages to a running agent

- **The action is within the launch prompt's grants:** send no nudge to an unattended agent while
  an external write is ahead of it, such as a push, a PR, a comment or a merge, because a message
  can make that write look unauthorised to its classifier.
- **The action goes beyond them,** such as a change outside the brief's scope: type it into the
  session as Refusals in `SKILL.md` says, when the owner's yes covers it; otherwise ask him first.
  A message grants nothing.
- A message that only narrows what the agent does, such as "keep your version of that test", needs
  no grant.

## Other briefs

A design session, an Investigation and an atc upgrade each have their own template: the reference
list in `SKILL.md` names them.
