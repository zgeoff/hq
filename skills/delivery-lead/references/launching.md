# Launching

Every launch: a Ready issue, a pitch, a relaunch, a design session or an ad-hoc session.

1. **Target:** an imp with a fresh checkout, unless the owner names a target and folder. Set
   `target` to the target `atc_spawn_options_get` lists with `provider: imp`, a `git` workspace at
   `ref: main`, and `trustClonedWorkspace: true` for a zgeoff repo. On `local`, use a folder Claude
   Code already trusts.
2. **Provider:** run `scripts/capacity.sh` as pacing.md says, and launch on what it picks, or hold.
   When it returns `launch.target: local`, launch here. An ad-hoc session uses the CLI the owner
   names, or Claude. Use Opus where offered.
3. **Prompt:** from its template, with the issue pasted in, since the agent may not reach Linear.
   Write as the owner, "I" to "you": the classifier reads "the owner" as someone else's claim. Write
   each approved action in the wording `briefs.private.md` gives, details word for word.
4. **Launch** with `atc_session_spawn`: `detached: true`, a name that says the outcome ("geo-92
   probability-sum validation"), and an `idempotencyKey` such as `geo-92-launch-1`.
5. **Check it started** 20 seconds later: `atc_session_get` shows it working, and for a `/goal`
   brief `atc_terminal_read` shows "Goal set". If the goal was too long, stop it, forget it once it
   exits, and relaunch shorter with a new key. Unsure whether it launched: look it up before
   retrying.
6. **Record it:** `hq run add <issue> --title <title> --session <session_id> --where imp|local`,
   plus `--design agent|with-geoff` for a design session. Comment the session, target and branch on
   the issue, and move it to In Progress.

A with-geoff design session: pin it, tell him its name, and stay out unless he asks you in.
