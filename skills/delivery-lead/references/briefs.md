# Briefs

Run `hq brief <issue>` for every launch that delivers code: a Ready issue, a relaunch or a pitch. It
fills [agent-kit/brief.md](../../../agent-kit/brief.md) from the issue, the playbook of its Type, the
private permission wording and the two blocks below, and prints the prompt. Add `--imp` on an imp,
`--issue-by-link` when the agent can reach Linear, and `--goal-file <path>` on a relaunch. A design
pass takes `--kind design`, and a PR walk `--kind pr-walk`. An Improvement gets the feature playbook,
since no Improvement playbook exists.

The session refuses a `/goal` line over 4,000 characters. `hq brief` cuts the brief to fit, as
[fit-brief.ts](../../../src/brief/fit-brief.ts) orders the cuts, and refuses with the count when it
still can't. When you edit a brief by hand, measure it with `hq brief check <file>` before you
launch.

The classifier reads only the launch prompt, so every grant goes in the prompt, never in a file. The
granting wording is in `skills/delivery-lead/references/briefs.private.md` in hq-private
(`hq defs` shows where). Grant no secret from another repo's vault.

`hq brief --json` lists in `unfilled` what it left for you:

- **`permissions:<action> (no wording)`:** the private file has no wording for that action. Pitch it
  to the owner as SKILL.md's Refusals says, and launch once he approves.
- **`permissions:<action>`:** the wording still holds a slot, such as `<stage>`. Fill it from the
  issue.
- **`playbook`:** the issue has no Type label, or its Type has no playbook. Ask `z-triage` to label
  it, or launch without one.

The stack line:

```text
Build this as a stack with the gh-stack skill, one reviewable layer per PR. Keep it current with `gh stack sync` rather than a rebase of one layer, and review each layer as the finish line says, with `--base <its parent branch>`.
```

The imp line:

```text
Lint, format and other light checks run in lefthook's pre-commit and pre-push hooks. Defer to CI for larger checks. This imp has 2 GiB: stop each sub-agent when its part is done, and end each test or build process before you start the next.
```

## Messages to a running agent

Until its FINAL note, an agent's classifier reads your message as someone other than the owner, and
that can make its next push look unapproved.

- A message that only narrows the work ("keep your version of that test"): send it.
- An action the prompt already grants: send nothing.
- An action beyond the grants: if the owner's yes covers it, type it in with `atc_terminal_type`, as
  SKILL.md's Refusals says. If not, ask him first.
