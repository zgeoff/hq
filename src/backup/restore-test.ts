import type { Database } from 'bun:sqlite';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { setMeta } from '../db/set-meta.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import type { Runner } from '../runner/types.ts';
import { restore } from './restore.ts';

// Restore the newest snapshot into a scratch directory and check what came back.
export async function restoreTest(db: Database, run: Runner, opts: { remote: boolean; scratch: string }, actor: string): Promise<{ ok: boolean; files: number; dbCheck: string; error: string | null }> {
  const dir = join(opts.scratch, `hq-restore-test-${Date.now()}`);
  let result = { ok: false, files: 0, dbCheck: 'not run', error: null as string | null };
  try {
    const r = await restore(run, dir, { snapshot: 'latest', remote: opts.remote });
    if (!r.db) throw new HqError('restore_test_failed', 'the snapshot holds no hq.db');
    const check = await run(['sqlite3', r.db, 'PRAGMA integrity_check;']);
    const tables = await run(['sqlite3', r.db, "SELECT count(*) FROM sqlite_master WHERE type = 'table';"]);
    const files = (await run(['find', dir, '-type', 'f'])).stdout.split('\n').filter(Boolean).length;
    result = { ok: check.stdout.trim() === 'ok' && Number(tables.stdout.trim()) > 0, files, dbCheck: `${check.stdout.trim()}, ${tables.stdout.trim()} tables`, error: null };
  } catch (e) {
    result.error = String((e as Error).message ?? e);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  db.transaction(() => {
    setMeta(db, 'backup_test', JSON.stringify({ at: iso(now()), remote: opts.remote, ...result }));
    logEvent(db, 'hq', 'backup', result.ok ? 'restore-tested' : 'restore-test-failed', actor, null, null, { remote: opts.remote, ...result });
  }).immediate();
  return result;
}
