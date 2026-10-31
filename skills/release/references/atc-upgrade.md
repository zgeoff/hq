# Upgrading atc

atc's daemon runs on the owner's PC as the user unit `atc-daemon.service` and hosts every session.
You decide when, launch one upgrade session to install and restart, and check the result. Your atc
tools reach the daemon through a gateway, so they fail for about a minute during the restart.

Restart only with `hq restart`: it gives each session a turn afterwards, and `systemctl` or
`atc daemon restart` leaves them idle. A restart interrupts everyone, so load every pending change
in one.

## When to restart

The daemon reads its config only at start, so a config change waits for a restart like a release.
Pending changes:

- an atc release newer than `daemon.build` in `atc_spawn_options_get`
  (`gh release list -R zgeoff/atc -L 1`);
- a written but unloaded config change, which its Linear issue says in a comment. Keep each such
  issue open until the restart.

Restart when the owner asks, when a pending change blocks someone's work, or when the daemon failed
to bring a session back. Tell him first, in one message: the restart, the upgrade session's name,
the changes it loads, and the minute without atc. If the daemon is down, tell him and launch
nothing.

## Launching the upgrade

Launch one Claude session on `local`, in `~/projects/atc` with no `workspace`, named "atc upgrade to
<version>" (or "atc restart" for config only), with the brief below. Its Permissions lines come from
`skills/release/references/atc-upgrade.private.md` in hq-private (`hq defs` shows where); without
it, launch nothing and tell `z-q`.

```text
Upgrade atc on this machine to the latest release and restart it.

Permissions:
<The Permissions lines from `atc-upgrade.private.md`.>

Pending changes this restart loads, each with the live check that proves it:
<one line per change, such as "the gateway agent's --plugin-dir: spawn a session on that agent and confirm the plugin loads">

Steps:
1. Record the installed build (atc --version), the running daemon's pid and build (~/.local/state/atc/daemon.json), and the latest release (gh release list -R zgeoff/atc -L 1). If the running build is already the latest, skip steps 2 and 3. If it is the latest and no pending change is listed, report that and stop.
2. Read the release notes and the PRs merged in zgeoff/atc since the running build, plus docs/architecture/remote-mcp.md, which covers the gateway and the daemon's listener. Look for deploy notes: new or renamed config keys, and changes to the daemon unit or its flags.
3. Run atc's install script: curl -fsSL https://raw.githubusercontent.com/zgeoff/atc/main/install.sh | sh. Expect: atc --version shows the new build.
4. Apply the deploy notes, and any pending config change that config.json doesn't hold yet: copy config.json and the unit file to a backup next to each, with a time suffix, make the edits, run atc config migrate --write to drop keys atc no longer reads, and run systemctl --user daemon-reload, which reloads the unit file and restarts nothing. List each edit for the report.
5. From 23:00 to 08:00 Sydney time, hq restart refuses: stop and report, with steps 1 to 4 done. Otherwise send a note with your atc bridge tool's note tool, which the session that launched you reads, with the old build, the new build, and the config and unit edits with their backup paths.
6. Start the restart with hq restart. It starts at once, and logs each step to ~/.local/state/hq/hq-restart-<time>.log, or under $XDG_STATE_HOME/hq/.
7. The restart stops this session mid-turn. The daemon brings it back, and hq wakes it. When a message asks you to verify the upgrade, check: atc-daemon.service is active, exactly one atc daemon process runs and it has --listen, daemon.json's pid matches it, atc --version shows the new build, and each pending change passes its live check. Report each result, with the log.

Finish line: the new build running in atc-daemon.service, every pending change validated, and reported.
```

## After the restart

When your atc tools answer, check `daemon.build` in `atc_spawn_options_get`, then send the upgrade
session "Verify the upgrade: run step 7 and report." and read its report. Message `z-qa` each
pending change's issue with its check result, to close the passed ones. Tell the owner the old and
new builds and any failure in one line. Still no answer after 5 minutes: tell him, since only he can
restart the daemon.
