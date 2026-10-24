import { readHostFacts } from '../atc/read-host-facts.ts';
import type { HostFacts } from '../atc/read-host-facts.ts';

// Where a running console takes requests for a new login link, by the uid's own dirs.
export function controlSocketPath(host: HostFacts = readHostFacts()): string {
  if (host.inTest) {
    return '/nonexistent/hq-test-no-console.sock';
  }
  if (host.runtimeDirExists) {
    return `/run/user/${host.uid}/hq-console.sock`;
  }
  return `${host.homedir}/.local/state/hq/hq-console.sock`;
}
