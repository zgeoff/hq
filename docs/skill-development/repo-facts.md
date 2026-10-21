# fleet skills

The skills, start prompts and design records for the `z-` atc sessions, which `hq fleet` loads from this repo's `main`. Nix's persona and `nixie.yaml` stay in [nixie-definitions](https://github.com/zgeoff/nixie-definitions), which [nixie](https://github.com/zgeoff/nixie) reads. Seven `z-` atc sessions run them, one per role; [sessions.md](../sessions.md) covers them.

## working on the skills

The owner shares excerpts from the sessions' transcripts, or a session reports a behaviour itself. Design the behaviour with the owner: he decides, and an agent's critique of the skills is input to weigh. A transcript rarely shows which skill line caused a behaviour, so infer the cause from it.

- `docs/skill-development/delivery-design.md` and `roles-design.md` in zgeoff/hq-private record the decisions and their reasons. Change a decision there when the skills change it.
- A rule's decision ID, such as `(decision D-cleanup-first)`, names its record in hq-private's `delivery-design.md` or `roles-design.md`, on the line `ID: D-cleanup-first.`; the owner's words for it live there, never in this repo.
- `docs/skill-development/evaluation.md` in zgeoff/hq-private lists the behavioural checks. Record each transcript result there, with the change it led to.
- Refusals the owner passes on go into `docs/skill-development/refusals.md` in zgeoff/hq-private, and their fixes go into the permission phrasing in hq-private's `skills/agent-delegation/references/briefs.private.md`.

Facts about the setup that the skills depend on:

- Nix reaches atc only through its MCP connector, so the skills document only that tool set.
- How permissions reach an agent, and whose words grant them, is in this file's private half: read `docs/skill-development/repo-facts.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of these facts.
- Nix has a personality, and may challenge the owner once before working toward his stated outcome.
- nixie loads each skill from its own folder, so each skill folder is self-contained and refers to the other skill by name.

## repos in scope

A fleet-wide sweep, audit or repo-sync rollout covers only the repos listed as in. Every other `zgeoff` repo is out until the owner adds it here.

In:

- `zgeoff/atc`
- `zgeoff/auto-mode`
- `zgeoff/auto-mode-evals`
- `zgeoff/cloud`
- `zgeoff/dotfiles`
- `zgeoff/homebrew-tap`
- `zgeoff/hq`
- `zgeoff/impz`
- `zgeoff/nixie`
- `zgeoff/nixie-definitions`
- `zgeoff/tools`
- `zgeoff/vers`

Out, as the owner decided on 2026-10-17 (decision D-repo-scope):

- `zgeoff/decree`: not a project in scope.
- `zgeoff/noslop` and `zgeoff/noslop-sandbox`: out for now, to fold in later.
- `zgeoff/workstream`, `zgeoff/bun-pty` and `zgeoff/coderabbit`: out.

## setup

Run `bun install` once. It installs oxfmt and the lefthook pre-commit hook, which formats staged markdown, YAML, and JSON files and runs the prose check on docs. CI fails a PR whose files oxfmt would change; `bun run fmt` fixes them.

## writing

Load the `docs-writing` skill for technical documentation: `readme.md` files, `docs/`, `linear/`, and this file. Run its `check-prose.sh` over the files you touched.

Skip `docs-writing` for `skills/`. Those files are prompts for a model, and their style follows [the Anthropic digest](docs/skill-development/anthropic-guidance.md).

`.claude/skills/docs-writing` is a copy of the shared skill in `zgeoff/tools` (`sync/skills/docs-writing`); update it from there rather than editing it here.
