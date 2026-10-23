# upgrading atc

The owner's atc daemon runs as the systemd user unit `atc-daemon.service`. The connector you use is the atc gateway, which runs on another machine and reaches the daemon through the daemon's listener, so the gateway can't reach the daemon while it restarts. Upgrading means installing the new binary and restarting the daemon with `hq restart`. Never restart it with `systemctl` or a bare `atc daemon restart`, because only `hq restart` wakes each interrupted session after the daemon restores it. A restart ends every session the daemon hosts.

## when

Restart the daemon rarely, because each restart interrupts every session. The daemon reads its config, including each agent entry, only when it starts, so a config change such as a gateway agent's `--plugin-dir` waits for a restart just as a new release does.

Batch these pending changes into one restart:

- atc releases newer than the running build: `atc_spawn_options_get` shows the running build as `daemon.build`; compare it with the latest release of zgeoff/atc.
- config changes that are written but not loaded yet.

Keep each pending change's Linear issue open, with a comment saying it waits for the next atc restart. Restart when the owner asks, when a pending change blocks work that someone waits on, or when a restore stalls, and validate every pending change in that restart. When the daemon is down, tell the owner, and launch nothing: the upgrade session runs under the daemon. Tell the owner when you decide to restart, before it runs. After a change to an agent entry, smoke-test the entry with one short spawn on that agent once the restart loads it.

## launching the upgrade

Launch one Claude session on the `local` target, in `~/projects/atc` with no `workspace`, named "atc upgrade to <version>", or "atc restart" when only config changes are pending, with the brief below. The brief's Permissions block is in this file's private half: read `skills/release/references/atc-upgrade.private.md` in the local hq-private clone (`hq defs` shows where it is) and follow it as part of this skill. Tell the owner the session name, the pending changes it loads, and that the connector can't reach his computer for about a minute while the daemon restarts.

```text
Upgrade atc on this machine to the latest release and restart it.

Permissions:
<The Permissions lines from this file's private half.>

Pending changes this restart loads, each with the live check that proves it:
<one line per change, such as "the gateway agent's --plugin-dir: spawn a session on that agent and confirm the plugin loads">

Steps:
1. Record the installed build (atc --version), the running daemon's pid and build (~/.local/state/atc/daemon.json), and the latest release (gh release list -R zgeoff/atc -L 1). If the running build is already the latest, skip steps 2 and 3. If it is the latest and no pending change is listed, report that and stop.
2. Read the release notes and the PRs merged in zgeoff/atc since the running build, plus docs/architecture/remote-mcp.md, for deploy notes: new or renamed config keys, and changes to the daemon unit or its flags.
3. Run the install script.
4. Apply the deploy notes, and any pending config change that config.json doesn't hold yet: back up config.json and the unit file, make the edits, run atc config migrate --write to drop keys atc no longer reads, and run systemctl --user daemon-reload. List each edit for the report.
5. From 23:00 to 08:00 Sydney time hq restart refuses: stop and report, with steps 1 to 4 done. Otherwise send a note through your ATC bridge tool (named note, or report on an older build), with the old build, the new build, and the config and unit edits with their backup paths.
6. Start the restart with hq restart. It starts at once, and logs each step to ~/.local/state/hq/hq-restart-<time>.log, or under $XDG_STATE_HOME/hq/.
7. The restart ends this session's turn; the daemon restores the session and hq wakes it. When a message asks you to verify the upgrade, check: atc-daemon.service is active, exactly one atc daemon process runs and it has --listen, daemon.json's pid matches it, atc --version shows the new build, and each pending change passes its live check. Report each result, with the log.

Finish line: the new build running in atc-daemon.service, every pending change validated, and reported.
```

## after

When the connector answers again, check `atc_spawn_options_get` for the new `daemon.build`. Then send the upgrade session "Verify the upgrade: run step 7 and report." with `atc_message_send`, and read its final report. Send `z-qa` each pending change's issue and its live check: `z-qa` closes each one whose check passed. Tell the owner the old and new builds, and any check that failed, in one line. If the connector can't reach the daemon for more than 5 minutes, tell the owner, since restarting the daemon needs his machine.
