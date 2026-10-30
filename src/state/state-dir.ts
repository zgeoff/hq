import { config } from '../config/config.ts';
import { getHome } from '../fleet/get-home.ts';

// Where the sessions keep their state files (<role>.md), archives and notes.
export function stateDir(): string {
  return config().HQ_STATE_DIR ?? `${getHome()}/.local/share/z-sessions`;
}
