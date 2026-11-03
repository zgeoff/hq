# Stack lock

Clearing the lock under a running deploy corrupts the stack state. Clear a stale prod stack lock
only when all of these hold:

- A Deploy prod run you dispatched was cancelled or timed out.
- No Deploy prod run is queued or in progress in zgeoff/cloud's GitHub Actions.
- No `pulumi` process runs on this PC.
- `pulumi stack export --stack prod` shows 0 pending operations.
- `bun run ops:host -- 'systemctl is-active drift-check'` shows that the host's drift-check service
  is not active.

Run each command in `~/projects/cloud`. Then, once, run `bun run ops:cancel-prod-lock -- --yes`
there. Dispatch Deploy prod again at the same commit, and post the new run to `hq news`.
