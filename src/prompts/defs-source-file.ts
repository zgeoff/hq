import { config } from '../config/config.ts';
import { getHome as HOME } from '../fleet/get-home.ts';

export function defsSourceFile(): string {
  return config().HQ_DEFS_SOURCE_FILE ?? `${HOME()}/.local/share/z-sessions/defs-source`;
}
