import { existsSync } from 'node:fs';
import { userInfo } from 'node:os';

export interface HostFacts {
  inTest: boolean;
  uid: number;
  homedir: string;
  runtimeDirExists: boolean;
}

// From the uid, never from HOME or XDG_RUNTIME_DIR, which the caller sets.
export function readHostFacts(): HostFacts {
  const uid = process.getuid?.() ?? -1;
  return { inTest: process.env['NODE_ENV'] === 'test', uid, homedir: userInfo().homedir, runtimeDirExists: existsSync(`/run/user/${uid}`) };
}
