import { existsSync } from 'node:fs';
import { userInfo } from 'node:os';

export interface HostFacts {
  inTest: boolean;
  uid: number;
  homedir: string;
  runtimeDirExists: boolean;
}

// The daemon's socket for a check of who is asking. It never comes from HQ_ATC_SOCKET, HOME or
// XDG_RUNTIME_DIR, which the caller sets: a session could point the check at a daemon of its own.
// It follows atc's rule from the uid instead: the runtime dir when there is one, else the state dir.
export function identitySocketPath(host: HostFacts = readHostFacts()): string {
  // A test reaches only the fake atc it injects: never the live daemon, even to read.
  if (host.inTest) {
    return '/nonexistent/hq-test-no-live-atc.sock';
  }
  if (host.runtimeDirExists) {
    return `/run/user/${host.uid}/atc-daemon.sock`;
  }
  return `${host.homedir}/.local/state/atc/atc-daemon.sock`;
}

function readHostFacts(): HostFacts {
  const uid = process.getuid?.() ?? -1;
  return { inTest: process.env['NODE_ENV'] === 'test', uid, homedir: userInfo().homedir, runtimeDirExists: existsSync(`/run/user/${uid}`) };
}
