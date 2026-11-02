import { config } from '../config/config.ts';
import { getHome } from '../fleet/get-home.ts';

export function stateDir(): string {
  return config().HQ_STATE_DIR ?? `${getHome()}/.local/share/z-sessions`;
}
