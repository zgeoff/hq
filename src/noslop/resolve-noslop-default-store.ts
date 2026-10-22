import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

// The store noslop itself opens: under XDG_DATA_HOME when it is set and absolute, or ~/.local/share
// otherwise.
export function resolveNoslopDefaultStore(env: Record<string, string | undefined>): string {
  const dataHome = pickDataHome(env['XDG_DATA_HOME'], env['HOME']);
  return join(dataHome, 'noslop', 'store.sqlite');
}

function pickDataHome(xdg: string | undefined, home: string | undefined): string {
  if (xdg !== undefined && isAbsolute(xdg)) {
    return xdg;
  }
  return join(home ?? homedir(), '.local', 'share');
}
