import type { Runner } from '../runner/types.ts';
import { loadBackupRepo as repoFor } from './load-backup-repo.ts';
import { runRestic as restic } from './run-restic.ts';
import type { Snapshot } from './types.ts';

export async function snapshots(run: Runner, remote: boolean): Promise<Snapshot[]> {
  const { args, extra } = repoFor(remote);
  return JSON.parse(await restic(run, [...args, 'snapshots', '--json', '--tag', 'hq'], extra)) as Snapshot[];
}
