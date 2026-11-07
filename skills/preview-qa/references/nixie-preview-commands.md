# Run a command in a nixie preview

Run nixie's preview runbook commands, the API check's included, inside the PR's preview imp. Never
run a runbook command on the cloud host itself.

- Skip each runbook step that starts or removes the preview, such as `docker compose up` or
  `docker compose down --volumes`. The preview is already running: the first rebinds its origin
  away from the preview link, and the second deletes its data. Read the sign-in code from the
  `enrol` logs instead, as step 3 of [Take a check](../SKILL.md#take-a-check) says.
- Run the API check from its step 2 to its last step in one call. Each call starts a new shell, so
  `origin`, `token` and `sent` are gone in the next one, and another enrol uses up another sign-in
  code. Where the check says to repeat a step, write a loop that waits 5 seconds between tries and
  stops after 5 minutes.
- Keep `-i` on `podman exec` in step 2. Without it, the commands never reach the imp, and the line
  prints nothing.
- Keep the quotes on `'EOF'`. Then your shell passes each `$` and each quote to the imp unchanged.

Read nixie's [preview.md](https://github.com/zgeoff/nixie/blob/main/docs/runbooks/preview.md) and
[preview-api-check.md](https://github.com/zgeoff/nixie/blob/main/docs/runbooks/preview-api-check.md)
at the head that `z-review` sent. The links show `main`, so read each runbook at the head, such as
with
`gh api 'repos/zgeoff/nixie/contents/docs/runbooks/preview.md?ref=<head sha>' -H 'Accept: application/vnd.github.raw'`.
Count each `conversation/send` request in the API check, retries included, in the check's `qa.md`
line, and stop at the cap that [Limits](../SKILL.md#limits) sets.

## Run a command in the preview

Run steps 1 and 2 in the same shell call, each time you run commands. Step 2 reads the variable
that step 1 sets.

1. Set `HQ_CLOUD_HOST`, the cloud host's ssh name. Expect: no output. When the second line prints
   `HQ_CLOUD_HOST is not set`, run `hq health`, file its whole output for `z-q`, the session that
   builds hq, as [Files, messages and faults](../SKILL.md#files-messages-and-faults) says, and
   stop.

   ```sh
   HQ_CLOUD_HOST=${HQ_CLOUD_HOST:-$(jq -r '.HQ_CLOUD_HOST // empty' "${HQ_LOCAL_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/hq/local.json}")}
   : "${HQ_CLOUD_HOST:?HQ_CLOUD_HOST is not set: run hq health}"
   ```

2. Run the commands in the preview's imp. Replace `<preview imp>` with the first label of the host
   in the link in the PR's preview comment, `pv-<hash>-<number>`. Replace `<commands>` with the
   runbook commands, one per line, as the runbook writes them, quotes included. Expect: the output
   the runbook gives for each command.

   ```sh
   ssh root@"$HQ_CLOUD_HOST" "podman exec -i imp-host impz exec <preview imp> -- sh -s" <<'EOF'
   set -e
   cd /srv/preview/preview
   <commands>
   EOF
   ```

   The shell in the imp reads the commands from stdin, and `set -e` stops it at the first command
   that fails.

## After the command

Act on what the command did:

- **The line fails.** ssh, podman or impz prints an error, or the line prints nothing where the
  runbook expects output. File the gap for `z-q`, and name hq. Then answer the live item that
  needed the command as needing the owner, in step 5 of [Take a check](../SKILL.md#take-a-check),
  so that the gap doesn't hold the PR.
- **The runbook step doesn't work as written.** File the step, and name nixie, as step 3 of
  [Take a check](../SKILL.md#take-a-check) says.
- **The step works and shows a fault in the PR.** Record the fault as a finding, and go on to the
  next command.
