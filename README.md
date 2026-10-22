<div align="center">
  <h1>hq</h1>

  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="./docs/sessions.md">The sessions</a> •
    <a href="./CHANGELOG.md">Changelog</a> •
    <a href="./REQUESTS.md">Requests</a>
  </p>
</div>

The command line and shared ledger of a crew of seven Claude Code sessions that run one owner's software team.

The crew triages issues, delivers them through agents, reviews and merges the PRs, and checks each
release live. hq keeps their score in one SQLite file: runs, review rounds, merge gates, calls for
the owner and grants. In its first 8 days hq shipped 219 releases, tracked 688 runs, counted 2,234
merged PRs across 14 repos, and recorded 1,985 review rounds on 892 PRs.

## Quick start

hq needs [Bun](https://bun.sh) and a local [atc](https://github.com/zgeoff/atc) daemon.

```sh
bun install
bun run install-bin   # builds ~/.local/bin/hq
hq status             # the open call for the owner, what is next and why it waits
hq review gate hq 9   # may merge: noslop findings: none open; CI green at b061edc
```

## The crew

| Session    | Name            | Job                                          |
| ---------- | --------------- | -------------------------------------------- |
| z-stu      | Stu             | the front desk: one question at a time       |
| z-delivery | z-delivery      | fills the lanes and ships what lands         |
| z-triage   | Sieve           | shapes each new issue into one call          |
| z-review   | Gatekeeper      | merges only when every finding has an answer |
| z-qa       | The Second Look | checks each change live, with evidence       |
| z-steward  | The Steward     | keeps the skills true, one PR at a time      |
| z-q        | The Toolsmith   | builds hq from the crew's requests           |

[Meet the crew](./docs/crew.md).

## Checks

Every change reaches `main` through a PR, a noslop review and green CI. Locally, run
`bun run fmt:check`, `bun run typecheck`, `bun run lint:changed` and `bun test`.

## Layout

- `src/`: the CLI, one folder per command family, and the schema migrations in `src/db/`.
- `skills/`: the crew's skills, one folder per role.
- `docs/`: how the sessions work together.

## Documentation

Start with [the sessions](./docs/sessions.md). `hq --help` lists every command.
