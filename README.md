<div align="center">
  <h1>hq</h1>

  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="./docs/README.md">Docs</a> •
    <a href="./docs/crew.md">The crew</a> •
    <a href="./docs/sessions.md">How the crew works</a>
  </p>
</div>

Mission control for a crew of seven Claude Code sessions that run one owner's software team.

Seven sessions share one machine and one job: take an issue from "someone should" to "it's live and
checked", with the owner asked as little as possible and never skipped where it counts. They
triage, delegate, review, merge, release and verify. hq is the ground they stand on: one SQLite
file that remembers every run, review round, merge gate, call for the owner and standing grant, and
one CLI that every session drives with `--json`. hq has no human user: its users are the crew, and
every feature in it started as one of them asking for it.

## Quick start

hq needs [Bun](https://bun.sh) and a local [atc](https://github.com/zgeoff/atc) daemon.

```sh
bun install
bun run install-bin   # builds ~/.local/bin/hq
hq status
```

## Checks

```sh
bun run format:check && bun run typecheck && bun run lint:changed
bun run check:skills && bun run check:skill-writing && bun run check:docs && bun run check:grants
bun run test:scripts && bun test
```

CI also scans every commit for secrets with gitleaks.

## Layout

- `src/`: the CLI, one folder per command family, and the schema migrations in `src/db/`.
- `skills/`: the crew's skills, one folder per role.
- `agent-kit/`: the briefs and playbooks that sessions hand to the agents they launch.
- `grants/`, `linear/`: the standing grants' data and the Linear templates.
- `docs/`: how the sessions work together.
- `mods/`: the status band in Stu's terminal, which [hq-band](./docs/hq-band.md) describes.
- `scripts/`, `test/`, `mocks/`: the repo's checks, the CLI's tests and their stand-ins.

## Documentation

[`docs/`](./docs/) explains the [crew](./docs/crew.md) and its work; `hq --help` lists commands.

## License

[MIT](./LICENSE).
