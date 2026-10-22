import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export function logPath(stamp: string): string {
  const explicit = process.env['XDG_STATE_HOME'],
    stateHome = explicit !== undefined && isAbsolute(explicit) ? explicit : join(process.env['HOME'] ?? homedir(), '.local', 'state');
  return join(stateHome, 'hq', `hq-restart-${stamp}.log`);
}
