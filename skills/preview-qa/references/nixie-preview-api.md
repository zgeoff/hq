# nixie preview API

How to drive a nixie preview until its `preview/README.md` covers it (GEO-1078). `z-qa` worked these steps out on 2026-10-17. Once the README has them, follow the README and delete this file.

## Calls

The API is oRPC under `/rpc`. Every call is a `POST` with the header `x-nixie-client: <any name>`; without it the API answers 403. The body is `{"json": <input>}`, and the answer comes back as `{"json": ...}`.

| Call                 | Input                                                                                                                         | Notes                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `sessions/enrol`     | `{clientActionID: <uuid>, code: <code>, deviceName, tokenDelivery: "bearer"}`                                                 | Signs in a test device. The code comes from `docker compose logs --no-log-prefix enrol`. Later calls send `Authorization: Bearer <token>`. |
| `sessions/issueCode` | `{clientActionID: <uuid>}`                                                                                                    | Issues a code for a second device, which then enrols with it.                                                                              |
| `conversation/send`  | `{clientMessageId: <uuid>, text, spans: [{start: 0, end: <UTF-16 length of text>, source: "typed"}], thread: "conversation"}` | Sends one turn. Each turn counts toward the 20-turn limit.                                                                                 |
| `conversation/read`  | `{thread: "conversation", limit}`                                                                                             | Reads records: `owner_message`, `model.reply` (its `message.text`), `model.turn_ended` and `task.step_*`.                                  |

## The shell

Reach the preview's imp from this PC with:

```sh
HQ_CLOUD_HOST=$(jq -r '.HQ_CLOUD_HOST // empty' "${HQ_LOCAL_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/hq/local.json}")
: "${HQ_CLOUD_HOST:?HQ_CLOUD_HOST is not set: run hq health}"
ssh root@"$HQ_CLOUD_HOST" "docker exec imp-host impz exec <preview imp> -- sh -c 'cd /srv/preview/preview && <command>'"
```

The cloud host's ssh name is `HQ_CLOUD_HOST` in hq's local settings file; `hq health` says when it is missing.

Keep the double quotes around the whole remote command. ssh joins its arguments into one string for the cloud host's shell, so without them the single quotes are lost: `sh -c` runs only the first word, and an `&&` runs the rest on the cloud host instead of in the preview. The preview's compose project is in `/srv/preview/preview`.

To reset the preview's data between checks and keep the enrolled devices, run this as the `<command>`:

```sh
docker compose exec -T nixie /app/preview/run-preview.sh reset --keep-sessions --yes
```

The reset exits the server, and compose's `restart: unless-stopped` starts it again. Wait for the health URL to answer before the next check.
