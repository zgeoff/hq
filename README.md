<div align="center">
  <h1>hq</h1>

  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="./docs/sessions.md">How the crew works</a> •
    <a href="./CHANGELOG.md">Changelog</a> •
    <a href="./REQUESTS.md">Requests</a>
  </p>
</div>

Mission control for a crew of seven Claude Code sessions that run one owner's software team.

Seven sessions share one machine and one job: take an issue from "someone should" to "it's live and
checked", with the owner asked as little as possible and never skipped where it counts. They
triage, delegate, review, merge, release and verify. hq is the ground they stand on: one SQLite
file that remembers every run, review round, merge gate, call for the owner and standing grant, and
one CLI that every session drives with `--json`.

hq has no human user. Its users are the crew, and every feature in it started as one of them asking
for it. [The crew](./docs/crew.md) introduces each session, follows one fix from report to release,
and lists the features they lean on.

## Quick start

hq needs [Bun](https://bun.sh) and a local [atc](https://github.com/zgeoff/atc) daemon.

```sh
bun install
bun run install-bin   # builds ~/.local/bin/hq
hq status
```

A quiet night looks like this:

```text
$ hq status
OPEN: none
NEXT: none
calls: 137 applied, 3 closed, 2 skipped · proposals: 56 applied, 2 closed
unblock: 2 open, 0 new since push
```

And this is the line Gatekeeper waits for before a merge:

```text
$ hq review gate hq 9
may merge: noslop findings: none open; CI green at b061edc
```

## Checks

- Every change reaches `main` through a PR, a noslop review and green CI. Nobody bypasses the
  ruleset, the Toolsmith included.
- Every review finding gets an answer: fixed with its commit, or the reason it is not a defect.
- Locally, run `bun run format:check`, `bun run typecheck`, `bun run lint:changed` and `bun test`.

## Layout

- `src/`: the CLI, one folder per command family, and the schema migrations in `src/db/`.
- `skills/`: the crew's skills, one folder per role.
- `docs/`: how the sessions work together.
- `mods/`: the status band in Stu's terminal, which [hq-band](./docs/hq-band.md) describes.

## Documentation

Start with [how the crew works](./docs/sessions.md) and [the crew](./docs/crew.md). `hq --help`
lists every command.

## License

[MIT](./LICENSE).
