import { existsSync, readFileSync } from 'node:fs';
import { HqError } from '../errors.ts';
import { backupPaths } from './backup-paths.ts';

// KEY=VALUE lines; values never printed.
export function readRemoteEnv(): Record<string, string> | null {
  const path = backupPaths().remoteEnv;
  if (!existsSync(path)) return null;
  const env: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  if (!env['RESTIC_REPOSITORY']) {
    throw new HqError('bad_config', `${path} has no RESTIC_REPOSITORY`);
  }
  return env;
}
