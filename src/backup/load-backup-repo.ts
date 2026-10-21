import { HqError } from '../errors.ts';
import { backupPaths } from './backup-paths.ts';
import { getLocalRepo as localRepo } from './get-local-repo.ts';
import { readRemoteEnv } from './read-remote-env.ts';

export function loadBackupRepo(remote: boolean): { args: string[]; extra: Record<string, string> } {
  if (!remote) return { args: ['-r', localRepo()], extra: {} };
  const env = readRemoteEnv();
  if (!env) throw new HqError('no_remote', `no remote configured: ${backupPaths().remoteEnv} is missing`);
  return { args: [], extra: env };
}
