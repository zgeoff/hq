# nixie preview API

Run nixie's preview runbook commands, the API check's included, inside a PR's preview imp, the
sandboxed machine on the cloud host that holds the preview.

- Keep the outer double quotes of the ssh line in step 2. Without them, the rest of the command runs
  on the cloud host.
- Run each command only through that line. When the line can't run a command, file the gap as
  [After the command](#after-the-command) says, and never run the command on the host directly.

Read nixie's `docs/runbooks/preview.md` and `docs/runbooks/preview-api-check.md` at the head that
`z-review` sent, such as with
`gh api 'repos/zgeoff/nixie/contents/docs/runbooks/preview.md?ref=<head sha>' -H 'Accept: application/vnd.github.raw'`.
Count each `conversation/send` request in the API check, retries included, against the PR's model
turns, and stop at the cap that [Limits](../SKILL.md#limits) sets.

## Run a command in the preview

Run steps 1 and 2 in the same shell call, each time you run a command, because step 2 reads the
variable that step 1 sets.

1. Set `HQ_CLOUD_HOST`, the cloud host's ssh name. Expect: no output. When the second line prints
   `HQ_CLOUD_HOST is not set`, run `hq health`, file its whole output in hq's Triage for `z-q`, the
   session that builds hq, as [Files and faults](../SKILL.md#files-and-faults) says, and stop.

   ```sh
   HQ_CLOUD_HOST=${HQ_CLOUD_HOST:-$(jq -r '.HQ_CLOUD_HOST // empty' "${HQ_LOCAL_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/hq/local.json}")}
   : "${HQ_CLOUD_HOST:?HQ_CLOUD_HOST is not set: run hq health}"
   ```

2. Run the command in the preview's imp, from `/srv/preview/preview`. Replace `<preview imp>` with
   the first label of the host in the link in the PR's preview comment, which starts `pv-`. Replace
   `<command>` with the runbook command. Expect: the output the runbook gives for that command.

   ```sh
   ssh root@"$HQ_CLOUD_HOST" "podman exec imp-host impz exec <preview imp> -- sh -c 'cd /srv/preview/preview && <command>'"
   ```

   Your local shell removes the outer double quotes, and the remote shell then reads the single
   quotes, so the whole `sh -c` string runs in the imp.

## After the command

Act on what the command did:

- **The line can't run it.** ssh or podman fails, or the command has single quotes of its own, such
  as a `curl` with a JSON body. File the gap in hq's Triage for `z-q`. Then answer the live item
  that needed the command as needing the owner, in step 5 of [Take a check](../SKILL.md#take-a-check),
  so that the gap doesn't hold the PR.
- **The runbook step doesn't work as written.** File the step in nixie's Triage, as step 3 of
  [Take a check](../SKILL.md#take-a-check) says.
- **The step works and shows a fault in the PR.** Record the fault as a finding, and go on to the
  next command.
