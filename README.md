# hq

The z- sessions' own tool for running the system: typed state objects with
transitions, `--json` on every command, and atc messages to the sessions a
change matters to. Built and kept by z-q.

- Runtime: Bun + TypeScript, `bun:sqlite` in WAL mode.
- Binary: `~/.local/bin/hq` (`bun run install-bin`).
- Database: `~/.local/share/z-sessions/hq.db` (override with `HQ_DB`).
- Local settings: machine-specific values live in `${XDG_CONFIG_HOME:-$HOME/.config}/hq/local.json`
  (override the path with `HQ_LOCAL_CONFIG`), never in tracked code. The file is a flat JSON object
  of strings, and hq never writes it. A variable set in the environment wins over the file. Only
  seven keys are read from it: `HQ_NOSLOP_OP_VAULT` and `HQ_NOSLOP_OP_ITEM` (the 1Password vault and
  item of noslop's GitHub app), `HQ_LINEAR_OP_REF` (the `op://` ref of the Linear key),
  `HQ_PROBE_TARGET` and `HQ_PROBE_READY` (the Nix live and ready URLs), `HQ_CLOUD_METRICS_URL`
  (the cloud host's metrics page that `hq capacity` reads), and `HQ_CLOUD_HOST` (the cloud host's
  ssh name, which the preview-qa skill reads). A command that needs a missing key
  refuses with `bad_config` naming the key and the file; `hq health` shows whether all seven are set.

See CHANGELOG.md for what shipped and REQUESTS.md for what sessions asked for.

## What hq moves by itself

- hq attaches an open or newly merged PR to the run its body names with a line starting
  `Fixes GEO-n` or `Contributes to GEO-n`. `Related to` never attaches.
- hq checks GitHub on a schedule and marks a run PR merged or closed as GitHub reports it.
- Runs in tools, noslop, hq and vers move to live-check (or done) from their release facts, as the other release repos already do.
- hq reads Ready per lane from Linear on a schedule, by lanes.json's rules.
- hq closes an open unblock item as done once a condition it was given holds.
- `hq run pr`, `hq run merged` and `hq run closed` still work, and a run does not need them.

## Changes

Every change reaches `main` through a pull request. A ruleset on `main` refuses direct pushes,
force pushes and deletion, and needs the `check` job green. Nobody bypasses it: merges never use
`--admin`.

1. Branch from `main` and open a PR.
2. CI (`.github/workflows/check.yml`) runs `bun run fmt:check` (oxfmt on markdown, YAML and
   JSON), `bun run typecheck` and `bun test`.
3. Before the merge, run `codex review --base origin/main` on the branch. Answer every finding:
   fix it, or say why not. Post the review and the answers as a PR comment.
4. Merge only PRs in your own paths. `.github/CODEOWNERS` records them: z-q owns `src/`,
   `test/` and `scripts/`; z-steward owns `skills/` and `docs/`. Both act through one GitHub
   login, so GitHub can't enforce the file.
