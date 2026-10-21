import { join } from 'node:path';
import { backupPaths } from './backup-paths.ts';

export function getStagingDir(): string {
  return join(backupPaths().state, 'staging');
}
