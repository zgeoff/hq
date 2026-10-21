// hq backup: an hourly, encrypted restic snapshot of hq's state and the z- sessions'
// transcripts, kept locally and copied off this PC when a remote is configured.
// hq.db goes in through sqlite's online backup, never as a raw file copy.
import type { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import type { Runner } from '../runner/types.ts';
import { backupPaths } from './backup-paths.ts';
import { ensurePassword } from './ensure-password.ts';
import { getLocalRepo as localRepo } from './get-local-repo.ts';
import { getStagingDir as staging } from './get-staging-dir.ts';
import { KEEP } from './keep.ts';
import { loadResticEnv as resticEnv } from './load-restic-env.ts';
import { readRemoteEnv } from './read-remote-env.ts';
import { runRestic as restic } from './run-restic.ts';
import { sources } from './sources.ts';
import type { BackupRun, Snapshot } from './types.ts';

export async function runBackup(db: Database, run: Runner, actor: string): Promise<BackupRun> {
  const started = Date.now();
  const at = iso(now());
  const result: BackupRun = { at, ok: false, snapshot: null, remote: 'not configured', error: null, seconds: 0 };
  try {
    ensurePassword();
    mkdirSync(backupPaths().state, { recursive: true, mode: 0o700 });
    const local = ['-r', localRepo()];
    await ensureRepo(run, local, {}, []);

    const src = sources();
    rmSync(staging(), { recursive: true, force: true });
    mkdirSync(staging(), { recursive: true, mode: 0o700 });
    const staged = join(staging(), 'hq.db');
    const copy = await run(['sqlite3', src.db, `.backup '${staged.replace(/'/g, "''")}'`]);
    if (copy.code !== 0) throw new HqError('db_backup_failed', `sqlite3 .backup failed: ${(copy.stderr || copy.stdout).trim()}`);
    const check = await run(['sqlite3', staged, 'PRAGMA integrity_check;']);
    if (check.code !== 0 || check.stdout.trim() !== 'ok') throw new HqError('db_backup_failed', `the staged hq.db failed its integrity check: ${check.stdout.trim().slice(0, 200)}`);

    const out = await restic(run, [...local, 'backup', '--json', '--tag', 'hq', '--host', 'hq', ...src.exclude.flatMap((e) => ['--exclude', e]), staged, ...src.dirs.filter((d) => existsSync(d))]);
    const summary = out
      .split('\n')
      .map((l) => {
        try {
          return JSON.parse(l) as { message_type?: string; snapshot_id?: string };
        } catch {
          return null;
        }
      })
      .find((m) => m?.message_type === 'summary');
    result.snapshot = summary?.snapshot_id?.slice(0, 8) ?? null;
    await restic(run, [...local, 'forget', '--tag', 'hq', '--keep-hourly', String(KEEP.hourly), '--keep-daily', String(KEEP.daily), '--prune']);

    const remote = readRemoteEnv();
    if (remote) {
      try {
        const extra = remote; // RESTIC_REPOSITORY travels in the environment, never in argv
        await ensureRepo(run, [], extra, ['--from-repo', localRepo(), '--from-password-file', backupPaths().password, '--copy-chunker-params']);
        await restic(run, ['copy', '--from-repo', localRepo(), '--from-password-file', backupPaths().password, '--tag', 'hq'], extra);
        // Check the copy landed: the newest local snapshot's time must be on the remote too.
        const newest = (snaps: Snapshot[]) => snaps.map((x) => x.time).sort().at(-1);
        const want = newest(JSON.parse(await restic(run, ['-r', localRepo(), 'snapshots', '--json', '--tag', 'hq'])) as Snapshot[]);
        const got = JSON.parse(await restic(run, ['snapshots', '--json', '--tag', 'hq'], extra)) as Snapshot[];
        if (!want || !got.some((x) => x.time === want)) throw new HqError('remote_copy_missing', `the remote lacks the newest snapshot (${got.length} remote snapshots)`);
        await restic(run, ['forget', '--tag', 'hq', '--keep-hourly', String(KEEP.hourly), '--keep-daily', String(KEEP.daily), '--prune'], extra);
        result.remote = 'copied';
      } catch (e) {
        result.remote = `failed: ${redact(String((e as Error).message ?? e), remote)}`;
      }
    }
    result.ok = !result.remote.startsWith('failed');
    if (!result.ok) result.error = result.remote;
  } catch (e) {
    result.error = String((e as Error).message ?? e);
  } finally {
    rmSync(staging(), { recursive: true, force: true });
  }
  result.seconds = Math.round((Date.now() - started) / 1000);
  db.transaction(() => {
    setMeta(db, 'backup_last', JSON.stringify(result));
    if (result.ok) setMeta(db, 'backup_last_ok', result.at);
    logEvent(db, 'hq', 'backup', result.ok ? 'backed-up' : 'backup-failed', actor, null, null, { ...result });
  }).immediate();
  return result;
}

async function ensureRepo(run: Runner, repoArgs: string[], extra: Record<string, string>, initArgs: string[]): Promise<boolean> {
  const probe = await run(['restic', ...repoArgs, 'cat', 'config'], { env: resticEnv(extra) });
  if (probe.code === 0) return false;
  await restic(run, [...repoArgs, 'init', ...initArgs], extra);
  return true;
}

// Remote values (a repository URL can carry a key) never reach an error, a log or an event.
function redact(text: string, extra: Record<string, string>): string {
  let out = text;
  for (const v of Object.values(extra)) if (v.length >= 4) out = out.split(v).join('***');
  return out;
}
