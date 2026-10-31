# nixie preview API

A nixie preview runs in its own imp on the cloud host. nixie's `preview/README.md` and
`docs/runbooks/preview-api-check.md`, read at the PR's head, say how to drive it. Each
`conversation/send` uses one of the PR's 20 model turns.

## Run a command in the preview

Runbook commands run in the preview's imp, from `/srv/preview/preview`.

1. Read the cloud host's ssh name. If it's unset, `hq health` reports the gap; send that to `z-q`
   and stop.

   ```sh
   HQ_CLOUD_HOST=${HQ_CLOUD_HOST:-$(jq -r '.HQ_CLOUD_HOST // empty' "${HQ_LOCAL_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/hq/local.json}")}
   : "${HQ_CLOUD_HOST:?HQ_CLOUD_HOST is not set: run hq health}"
   ```

2. Run one runbook command:

   ```sh
   ssh root@"$HQ_CLOUD_HOST" "docker exec imp-host impz exec <preview imp> -- sh -c 'cd /srv/preview/preview && <command>'"
   ```

Keep the outer double quotes: without them ssh drops the single quotes, and everything after `&&`
runs on the cloud host. A command with its own quotes, such as `curl` with a JSON body, breaks this.
When one fails, file the gap in Triage; never work around it on the host.
