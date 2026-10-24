import { readHostFacts } from './read-host-facts.ts';
import type { HostFacts } from './read-host-facts.ts';

// The daemon's socket for a check of who is asking. It never comes from HQ_ATC_SOCKET, HOME or
// XDG_RUNTIME_DIR, which the caller sets: a session could point the check at a daemon of its own.
// It follows atc's rule from the uid instead: the runtime dir when there is one, else the state dir.
export function identitySocketPath(host: HostFacts = readHostFacts()): string {
  if (host.inTest) {
    return '/nonexistent/hq-test-no-live-atc.sock';
  }
  if (host.runtimeDirExists) {
    return `/run/user/${host.uid}/atc-daemon.sock`;
  }
  return `${host.homedir}/.local/state/atc/atc-daemon.sock`;
}
