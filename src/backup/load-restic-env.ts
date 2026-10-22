import { backupPaths } from './backup-paths.ts';

// No inherited RESTIC_* setting may steer a run (RESTIC_HOST would filter every snapshot out).
export function loadResticEnv(extra: Record<string, string> = {}): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('RESTIC_') && !k.startsWith('ATC_')) env[k] = v;
  const own = { ...extra };
  delete own['RESTIC_HOST'];
  delete own['RESTIC_PASSWORD'];
  delete own['RESTIC_PASSWORD_COMMAND'];
  return { ...env, ...own, RESTIC_PASSWORD_FILE: backupPaths().password };
}
