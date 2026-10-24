import { existsSync } from 'node:fs';
import { userInfo } from 'node:os';

// The daemon's socket for a check of who is asking. It never comes from HQ_ATC_SOCKET, HOME or
// XDG_RUNTIME_DIR, which the caller sets: a session could point the check at a daemon of its own.
// It follows atc's rule from the uid instead: the runtime dir when there is one, else the state dir.
export function identitySocketPath(): string {
  // A test reaches only the fake atc it injects: never the live daemon, even to read.
  if (process.env['NODE_ENV'] === 'test') {
    return '/nonexistent/hq-test-no-live-atc.sock';
  }
  const runtime = `/run/user/${process.getuid?.() ?? -1}`;
  if (existsSync(runtime)) {
    return `${runtime}/atc-daemon.sock`;
  }
  return `${userInfo().homedir}/.local/state/atc/atc-daemon.sock`;
}
