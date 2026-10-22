import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { loadBackupRepo as repoFor } from './load-backup-repo.ts';
import { runRestic as restic } from './run-restic.ts';

const SnapshotSchema = z.looseObject({ paths: z.array(z.string()) });
const SnapshotsSchema = z.array(SnapshotSchema);

// Restore one snapshot into an empty or new directory. Never writes over live state.
// restic restores each file under its path when backed up, so hq.db is found from the snapshot's
// own paths: a snapshot taken under another HOME or backup dir staged it somewhere else.
export async function restore(run: Runner, to: string, opts: { snapshot: string; remote: boolean }): Promise<{ to: string; db: string | null }> {
  if (existsSync(to) && readdirSync(to).length) throw new HqError('bad_args', `--to ${to} is not empty`);
  if (!/^(latest|[0-9a-f]{8,64})$/.test(opts.snapshot)) throw new HqError('bad_args', '--snapshot must be latest or a snapshot id');
  mkdirSync(to, { recursive: true });
  const { args, extra } = repoFor(opts.remote);
  const listed = await restic(run, [...args, 'snapshots', '--json', '--tag', 'hq', opts.snapshot], extra);
  const [snapshot] = SnapshotsSchema.parse(JSON.parse(listed));
  await restic(run, [...args, 'restore', opts.snapshot, '--tag', 'hq', '--target', to], extra);
  const staged = snapshot?.paths.find((path) => basename(path) === 'hq.db');
  const db = staged === undefined ? null : join(to, staged);
  return { to, db: db !== null && existsSync(db) ? db : null };
}
