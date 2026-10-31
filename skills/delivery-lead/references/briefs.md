# Briefs

Fill [agent-kit/brief.md](../../../agent-kit/brief.md) for every launch that delivers code: a Ready issue, a relaunch or a pitch.
Keep the whole prompt under 4,000 characters, or the session refuses its `/goal` line.

The classifier reads only the launch prompt, so every grant goes in the prompt, never in a file. The
granting wording is in `skills/delivery-lead/references/briefs.private.md` in hq-private
(`hq defs` shows where). Without that clone, stop and tell the owner you can't fill
`{{permissions}}`. Grant no secret from another repo's vault.

## Placeholders

Paste each part of the issue as written.

| Placeholder        | What goes in                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `{{repo}}`         | `zgeoff/<repo>`                                                                                                   |
| `{{issue_id}}`     | `GEO-n`                                                                                                           |
| `{{issue}}`        | Outcome, Context, Scope, Acceptance and Agent notes. For several PRs, Scope names each.                           |
| `{{permissions}}`  | The private wording for each listed Action, always including Code delivery                                        |
| `{{stack}}`        | The stack line below, for size L or XL (`hq run show <issue>`); otherwise empty                                   |
| `{{fixes}}`        | `Fixes` when the merge meets every Acceptance item; `Contributes to` when a release, deploy or live check remains |
| `{{review_lines}}` | A pinned `gh api` line to `agent-kit/review-lines.md` for a repo `hq noslop` lists; otherwise empty               |
| `{{not_yours}}`    | Per step that needs a deploy or live system: ` <step> is not yours; it runs after the merge.`                     |
| `{{imp_line}}`     | The imp line below, on an imp; otherwise empty                                                                    |
| `{{goal_file}}`    | `. The full issue is in <path>; read it first.` when Length step 1 moved it; otherwise empty                      |

The stack line:

```text
Build this as a stack with the gh-stack skill, one reviewable layer per PR. Keep it current with `gh stack sync` rather than a rebase of one layer, and review each layer as the finish line says, with `--base <its parent branch>`.
```

The imp line:

```text
Lint, format and other light checks run in lefthook's pre-commit and pre-push hooks. Defer to CI for larger checks. This imp has 2 GiB: stop each sub-agent when its part is done, and end each test or build process before you start the next.
```

## Length

The `/goal` line names a ready PR, never the outcome: Claude Code checks it each turn and can't see
a live system. Count with `wc -c`. Over 4,000 characters, take these steps until it fits:

1. Move the pasted issue to a file in the checkout and set `{{goal_file}}`. Keep the Permissions
   block, the `Finish line:` paragraph and the last paragraph in the prompt.
2. Cut the issue's Context and Agent notes.
3. Drop the `/goal` line; `Finish line:` still states the goal.

## Messages to a running agent

Until its FINAL note, an agent's classifier reads your message as someone other than the owner, and
that can make its next push look unapproved.

- A message that only narrows the work ("keep your version of that test"): send it.
- An action the prompt already grants: send nothing.
- An action beyond the grants: if the owner's yes covers it, type it in with `atc_terminal_type`, as
  SKILL.md's Refusals says. If not, ask him first.
