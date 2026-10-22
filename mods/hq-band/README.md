# hq-band

A Claude Code mod that draws one line above z-stu's prompt, refreshed every minute:

```
Needs you 0 · Nix up · lanes 10/17 (impd 16/16 GiB, 16/16 vCPU) · CI green · reviews 3
```

The line comes from `hq band --json`, which reads only what hq already stores. hq decides each segment's text and tone, and the mod only draws them: red when something needs Geoff, Nix is down or CI failed, amber near impd's line or when hq can't tell. When hq can't be read, the band says `hq unreachable`.

## /hq

`/hq` opens a pane with the detail behind the band, and `/hq close` closes it. The pane shows what needs Geoff with its links, Nix today, a heat map of the lanes with the runs that hold each slot, reviews in flight, what merged today, and the newest news. It comes from `hq pane --json`, read with the band each minute. The terminal draws the heat map as a Raster, two columns to a slot: green while the lane has room, amber when it is full.

## Only z-stu

Two layers keep the band out of every other session.

1. **Load it for z-stu only.** fleet.json gives z-stu `"pluginDirs": ["~/projects/hq/mods/hq-band"]`, and `hq fleet ensure` passes the list to atc's spawn, which starts Claude Code with `--plugin-dir ~/projects/hq/mods/hq-band`. This needs atc 4.15.0 or later. A z-stu spawned before that change runs without the band until it is respawned; `hq fleet` names the mismatch.
2. **Inert anywhere else.** On `session.start` the mod runs `hq whois $ATC_SESSION_ID --json` once, with a 10 s limit. Unless hq names the session `z-stu`, the mod starts no timer, registers no `/hq`, runs nothing more and draws nothing: its hooks pass straight through. A failed or slow whois has the same result.

> **CAUTION:** Never set `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`. That loads the mod in every session on the PC. Layer 2 keeps it inert there, but each session then runs one `hq whois` at start.

A `--plugin-dir` folder is watched. The band reloads when the folder changes, for example when `git merge --ff-only origin/main` updates `~/projects/hq` before `bun run install-bin`.

## Settings

- `HQ_BAND_BIN`: the hq to run. The default is `~/.local/bin/hq`.

## Checks

Run these from this folder; hq's CI runs neither, because CI has no `claude`.

```sh
claude plugin validate .
claude plugin test .
```

hq's own tests cover `hq band` and `hq whois` (`src/band/load-band.test.ts`, `src/atc/find-fleet-name.test.ts`).
