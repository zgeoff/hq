import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { HqError } from '../errors.ts';
import type { Runner } from '../runner/types.ts';
import { loadBackupRepo as repoFor } from './load-backup-repo.ts';
import { runRestic as restic } from './run-restic.ts';

interface RestoreOptions {
  snapshot: string;
  remote: boolean;
}

const SnapshotSchema = z.looseObject({ paths: z.array(z.string()) });
const SnapshotsSchema = z.array(SnapshotSchema);

// Restore one snapshot into an empty or new directory. Never writes over live state.
// restic restores each file under its path when backed up, so hq.db is found from the snapshot's
// own paths: a snapshot taken under another HOME or backup dir staged it somewhere else.
export async function restore(run: Runner, to: string, opts: RestoreOptions): Promise<{ to: string; db: string | null }> {
  if (!/^(latest|[0-9a-f]{8,64})$/.test(opts.snapshot)) throw new HqError('bad_args', '--snapshot must be latest or a snapshot id');
  const lock = createRestoreLock(to);
  try {
    if (existsSync(to) && readdirSync(to).length) throw new HqError('bad_args', `--to ${to} is not empty`);
    mkdirSync(to, { recursive: true });
    return await restoreInto(run, to, opts);
  } finally {
    rmSync(lock, { force: true });
  }
}

// Beside the directory, not in it, so the restore lands in a directory that holds only the snapshot.
// Held from the emptiness check to the end, so a second restore to the same place cannot mix in.
function createRestoreLock(to: string): string {
  const lock = `${resolve(to)}.restore-lock`;
  mkdirSync(dirname(lock), { recursive: true });
  try {
    writeFileSync(lock, `${process.pid}\n`, { flag: 'wx' });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw new HqError('restore_busy', `another restore into ${to} holds ${lock}; if none runs, remove that file and try again`);
    }
    throw error;
  }
  return lock;
}

async function restoreInto(run: Runner, to: string, opts: RestoreOptions): Promise<{ to: string; db: string | null }> {
  const { args, extra } = repoFor(opts.remote);
  const listed = await restic(run, [...args, 'snapshots', '--json', '--tag', 'hq', opts.snapshot], extra);
  const [snapshot] = SnapshotsSchema.parse(JSON.parse(listed));
  await restic(run, [...args, 'restore', opts.snapshot, '--tag', 'hq', '--target', to], extra);
  const staged = snapshot?.paths.find((path) => basename(path) === 'hq.db');
  const db = staged === undefined ? null : join(to, staged);
  return { to, db: db !== null && existsSync(db) ? db : null };
}
