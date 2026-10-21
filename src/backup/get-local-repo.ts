import { join } from 'node:path';
import { backupPaths } from './backup-paths.ts';

export function getLocalRepo(): string {
  return join(backupPaths().state, 'repo');
}
