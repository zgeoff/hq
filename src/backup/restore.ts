import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { getStagingDir as staging } from './get-staging-dir.ts';
import { loadBackupRepo as repoFor } from './load-backup-repo.ts';
import { runRestic as restic } from './run-restic.ts';

// Restore one snapshot into an empty or new directory. Never writes over live state.
export async function restore(run: Runner, to: string, opts: { snapshot: string; remote: boolean }): Promise<{ to: string; db: string | null }> {
  if (existsSync(to) && readdirSync(to).length) throw new HqError('bad_args', `--to ${to} is not empty`);
  if (!/^(latest|[0-9a-f]{8,64})$/.test(opts.snapshot)) throw new HqError('bad_args', '--snapshot must be latest or a snapshot id');
  mkdirSync(to, { recursive: true });
  const { args, extra } = repoFor(opts.remote);
  await restic(run, [...args, 'restore', opts.snapshot, '--tag', 'hq', '--target', to], extra);
  const db = join(to, staging(), 'hq.db');
  return { to, db: existsSync(db) ? db : null };
}
