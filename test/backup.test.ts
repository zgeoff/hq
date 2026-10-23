import { afterEach, beforeEach, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensurePassword } from '../src/backup/ensure-password.ts';
import { lastBackup } from '../src/backup/last-backup.ts';
import { readRemoteEnv } from '../src/backup/read-remote-env.ts';
import { restoreTest } from '../src/backup/restore-test.ts';
import { restore } from '../src/backup/restore.ts';
import { runBackup } from '../src/backup/run-backup.ts';
import { snapshots } from '../src/backup/snapshots.ts';
import type { Runner } from '../src/runner/types.ts';
import { realRunner } from '../src/runner/real-runner.ts';
import { freshDb, requireEnv } from './helpers.ts';

// Real restic against temp repos. Skipped where restic isn't installed.
const hasRestic = Bun.which('restic') !== null && Bun.which('sqlite3') !== null;

let db: Database;
let dir: string;
let cleanup: () => void;
beforeEach(() => {
  ({ db, dir, cleanup } = freshDb());
  process.env['HQ_BACKUP_DIR'] = `${dir}/backup`;
  process.env['HQ_BACKUP_PASSWORD_FILE'] = `${dir}/cfg/backup-password`;
  process.env['HQ_BACKUP_REMOTE_ENV'] = `${dir}/cfg/remote.env`;
  mkdirSync(`${dir}/sessions`, { recursive: true });
  writeFileSync(`${dir}/sessions/notes.md`, 'Invented notes: the kettle is fine.\n');
  mkdirSync(`${dir}/transcripts`, { recursive: true });
  writeFileSync(`${dir}/transcripts/t1.jsonl`, '{"invented":"line"}\n');
  process.env['HQ_BACKUP_DB'] = requireEnv('HQ_DB');
  process.env['HQ_BACKUP_DIRS'] = `${dir}/sessions:${dir}/transcripts`;
});
afterEach(() => {
  for (const k of ['HQ_BACKUP_DIR', 'HQ_BACKUP_PASSWORD_FILE', 'HQ_BACKUP_REMOTE_ENV', 'HQ_BACKUP_DB', 'HQ_BACKUP_DIRS']) delete process.env[k];
  cleanup();
});

test.skipIf(!hasRestic)('backs up hq.db online plus the dirs, restores them, and passes a restore test', async () => {
  db.exec("CREATE TABLE kettle (note TEXT); INSERT INTO kettle VALUES ('whistles once')");
  const r = await runBackup(db, realRunner, 'z-q');
  expect(r.error).toBeNull();
  expect(r.ok).toBe(true);
  expect(r.remote).toBe('not configured');
  expect(statSync(requireEnv('HQ_BACKUP_PASSWORD_FILE')).mode & 0o777).toBe(0o600);
  expect(existsSync(`${dir}/backup/staging`)).toBe(false); // staging is cleaned up

  const out = `${dir}/restored`;
  const back = await restore(realRunner, out, { snapshot: 'latest', remote: false });
  expect(back.db).not.toBeNull();
  const copy = new Database(back.db!, { readonly: true });
  expect(copy.query('SELECT note FROM kettle').get()).toEqual({ note: 'whistles once' });
  copy.close();
  expect(readFileSync(join(out, dir, 'sessions/notes.md'), 'utf8')).toContain('kettle is fine');
  expect(existsSync(join(out, dir, 'transcripts/t1.jsonl'))).toBe(true);
  await expect(restore(realRunner, out, { snapshot: 'latest', remote: false })).rejects.toThrow('not empty');

  const t = await restoreTest(db, realRunner, { remote: false, scratch: dir }, 'z-q');
  expect(t.error).toBeNull();
  expect(t.ok).toBe(true);
  expect(lastBackup(db).test).toMatchObject({ ok: true });
}, 120_000);

test('a second restore into the same directory is refused while the first runs, and the lock goes when it ends', async () => {
  const listed = Promise.withResolvers<void>();
  const calls: string[] = [];
  const run: Runner = async (cmd) => {
    calls.push(cmd[3] ?? '');
    if (cmd[3] === 'snapshots') {
      await listed.promise;
      return { code: 0, stdout: JSON.stringify([{ paths: ['/invented/staging/hq.db'] }]), stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  const first = restore(run, `${dir}/restored`, { snapshot: 'latest', remote: false });

  const second = await restore(run, `${dir}/restored`, { snapshot: 'latest', remote: false }).then(
    () => null,
    (error: unknown) => error,
  );
  listed.resolve();

  expect(second).toMatchObject({ code: 'restore_busy' });
  await expect(first).resolves.toStrictEqual({ to: `${dir}/restored`, db: null });
  expect([calls, existsSync(`${dir}/restored.restore-lock`)]).toStrictEqual([['snapshots', 'restore'], false]);
});

test.skipIf(!hasRestic)('copies to a configured remote, and a bad remote fails the run without losing the local snapshot', async () => {
  mkdirSync(`${dir}/cfg`, { recursive: true });
  writeFileSync(requireEnv('HQ_BACKUP_REMOTE_ENV'), `# invented remote\nRESTIC_REPOSITORY=${dir}/remote-repo\n`);
  const r = await runBackup(db, realRunner, 'z-q');
  expect(r.error).toBeNull();
  expect(r.remote).toBe('copied');
  expect(await snapshots(realRunner, true)).toHaveLength(1);
  const t = await restoreTest(db, realRunner, { remote: true, scratch: dir }, 'z-q');
  expect(t.ok).toBe(true);

  writeFileSync(requireEnv('HQ_BACKUP_REMOTE_ENV'), `RESTIC_REPOSITORY=${dir}/no/such/place/repo-file\n`);
  writeFileSync(`${dir}/no`, 'a file where a directory should be');
  const bad = await runBackup(db, realRunner, 'z-q');
  expect(bad.ok).toBe(false);
  expect(bad.remote).toMatch(/^failed:/);
  expect(await snapshots(realRunner, false)).toHaveLength(2);
  expect(lastBackup(db).lastOk).toBe(r.at);
}, 120_000);

test.skipIf(!hasRestic)('it finds the restored hq.db where the snapshot staged it, when the backup dir has moved since', async () => {
  db.exec("CREATE TABLE kettle (note TEXT); INSERT INTO kettle VALUES ('whistles twice')");
  const backedUp = await runBackup(db, realRunner, 'z-q');
  expect(backedUp.ok).toBe(true);
  mkdirSync(`${dir}/moved`, { recursive: true });
  renameSync(`${dir}/backup`, `${dir}/moved/backup`);
  process.env['HQ_BACKUP_DIR'] = `${dir}/moved/backup`;

  const back = await restore(realRunner, `${dir}/restored`, { snapshot: 'latest', remote: false });
  expect(back.db).toBe(join(`${dir}/restored`, dir, 'backup/staging/hq.db'));
}, 120_000);

test("it refuses to back up while another run holds the staging dir, and leaves that run's staged copy alone", async () => {
  mkdirSync(`${dir}/backup/staging`, { recursive: true });
  writeFileSync(`${dir}/backup/staging/hq.db`, 'the other run staged this');
  const held = new Database(`${dir}/backup/staging-lock.sqlite`, { create: true });
  held.run('CREATE TABLE holder (id INTEGER PRIMARY KEY CHECK (id = 1), pid INTEGER NOT NULL)');
  held.query('INSERT INTO holder (id, pid) VALUES (1, ?)').run(process.pid);

  const result = await runBackup(db, realRunner, 'z-q');
  expect(result).toMatchObject({ ok: false, error: `another hq backup is running (pid ${process.pid}); this run left its staging dir alone` });
  expect(readFileSync(`${dir}/backup/staging/hq.db`, 'utf8')).toBe('the other run staged this');
  expect(held.query('SELECT pid FROM holder').all()).toStrictEqual([{ pid: process.pid }]);
  held.close();
});

test('it lets one run take over a dead staging lock when several find it at once', async () => {
  const gone = Bun.spawn(['true']);
  await gone.exited;
  mkdirSync(`${dir}/backup`, { recursive: true });
  const held = new Database(`${dir}/backup/staging-lock.sqlite`, { create: true });
  held.run('CREATE TABLE holder (id INTEGER PRIMARY KEY CHECK (id = 1), pid INTEGER NOT NULL)');
  held.query('INSERT INTO holder (id, pid) VALUES (1, ?)').run(gone.pid);
  held.close();
  const barrier = `${dir}/barrier`;
  mkdirSync(barrier);
  const script = `const { openDb } = await import(${JSON.stringify(join(import.meta.dir, '../src/db/open-db.ts'))}); const { runBackup } = await import(${JSON.stringify(join(import.meta.dir, '../src/backup/run-backup.ts'))}); const { existsSync, writeFileSync } = await import('node:fs'); const slow = async () => { await Bun.sleep(100); return { code: 0, stdout: 'ok', stderr: '' }; }; const db = openDb(); writeFileSync(\`${barrier}/ready-\${process.pid}\`, ''); while (!existsSync('${barrier}/go')) { await Bun.sleep(5); } const result = await runBackup(db, slow, 'z-q'); console.log(result.ok ? 'ran' : 'busy');`;
  const runs = Array.from({ length: 8 }, () => Bun.spawn(['bun', '-e', script], { env: { ...process.env }, stdout: 'pipe' }));
  const waitUntilAllReady = async (): Promise<void> => {
    while (readdirSync(barrier).length < runs.length && runs.every((run) => run.exitCode === null)) {
      await Bun.sleep(5);
    }
  };
  await waitUntilAllReady();
  writeFileSync(`${barrier}/go`, '');

  const outcomes = await Promise.all(runs.map((run) => new Response(run.stdout).text()));

  expect(outcomes.map((line) => line.trim()).toSorted()).toStrictEqual(['busy', 'busy', 'busy', 'busy', 'busy', 'busy', 'busy', 'ran']);
});

test.skipIf(!hasRestic)('it takes over a staging lock whose run is gone, and releases it when done', async () => {
  const gone = Bun.spawn(['true']);
  await gone.exited;
  mkdirSync(`${dir}/backup`, { recursive: true });
  const held = new Database(`${dir}/backup/staging-lock.sqlite`, { create: true });
  held.run('CREATE TABLE holder (id INTEGER PRIMARY KEY CHECK (id = 1), pid INTEGER NOT NULL)');
  held.query('INSERT INTO holder (id, pid) VALUES (1, ?)').run(gone.pid);

  const result = await runBackup(db, realRunner, 'z-q');
  expect(result.error).toBeNull();
  expect(held.query('SELECT pid FROM holder').all()).toStrictEqual([]);
  held.close();
}, 120_000);

test('a remote env file needs RESTIC_REPOSITORY; values are read, not echoed', () => {
  mkdirSync(`${dir}/cfg`, { recursive: true });
  writeFileSync(requireEnv('HQ_BACKUP_REMOTE_ENV'), 'AWS_ACCESS_KEY_ID=invented\n');
  expect(() => readRemoteEnv()).toThrow('no RESTIC_REPOSITORY');
  writeFileSync(requireEnv('HQ_BACKUP_REMOTE_ENV'), 'RESTIC_REPOSITORY="s3:https://example.com/bucket"\nAWS_SECRET_ACCESS_KEY=invented-secret\n');
  expect(readRemoteEnv()).toEqual({ RESTIC_REPOSITORY: 's3:https://example.com/bucket', AWS_SECRET_ACCESS_KEY: 'invented-secret' });
});

test.skipIf(!hasRestic)('a remote secret never reaches argv, errors or events; RESTIC_HOST cannot hide the copy', async () => {
  mkdirSync(`${dir}/cfg`, { recursive: true });
  const sentinel = 'INVENTED-SENTINEL-9f3a';
  writeFileSync(requireEnv('HQ_BACKUP_REMOTE_ENV'), `RESTIC_REPOSITORY=${dir}/missing-parent-${sentinel}/x/repo\nRESTIC_HOST=other-host\n`);
  writeFileSync(`${dir}/missing-parent-${sentinel}`, 'a file, so the repo path fails');
  const argv: string[][] = [];
  const spy: Runner = (cmd, opts) => (argv.push(cmd), realRunner(cmd, opts));
  const bad = await runBackup(db, spy, 'z-q');
  expect(bad.ok).toBe(false);
  expect(bad.error).toContain('details withheld');
  expect(argv.flat().join(' ')).not.toContain(sentinel);
  expect(JSON.stringify(bad)).not.toContain(sentinel);
  expect(JSON.stringify(db.query('SELECT data FROM events').all())).not.toContain(sentinel);

  // restic drops the rest: prefix in its errors, which beat a plain find-and-replace.
  writeFileSync(requireEnv('HQ_BACKUP_REMOTE_ENV'), `RESTIC_REPOSITORY=rest:http://user:${sentinel}@localhost:1/bad%zz\n`);
  const rest = await runBackup(db, realRunner, 'z-q');
  expect(rest.ok).toBe(false);
  expect(JSON.stringify(rest)).not.toContain(sentinel);
  expect(JSON.stringify(db.query('SELECT data FROM events').all())).not.toContain(sentinel);
  await expect(restoreTest(db, realRunner, { remote: true, scratch: dir }, 'z-q').then((t) => JSON.stringify(t))).resolves.not.toContain(sentinel);

  writeFileSync(requireEnv('HQ_BACKUP_REMOTE_ENV'), `RESTIC_REPOSITORY=${dir}/remote-repo\nRESTIC_HOST=other-host\n`);
  process.env['RESTIC_HOST'] = 'other-host';
  try {
    const ok = await runBackup(db, realRunner, 'z-q');
    expect(ok.error).toBeNull();
    expect(ok.remote).toBe('copied');
    expect((await snapshots(realRunner, true)).length).toBeGreaterThan(0);
  } finally {
    delete process.env['RESTIC_HOST'];
  }
}, 120_000);

test('it writes the password exactly once when first runs start together', async () => {
  const go = String(Date.now() + 2000);
  const script = `const { ensurePassword } = await import(${JSON.stringify(join(import.meta.dir, '../src/backup/ensure-password.ts'))}); while (Date.now() < Number(process.env.GO)) {} console.log(JSON.stringify(ensurePassword().created))`;
  const runs = Array.from({ length: 12 }, () => Bun.spawn(['bun', '-e', script], { env: { ...process.env, GO: go }, stdout: 'pipe' }));
  const created = await Promise.all(runs.map((run) => new Response(run.stdout).text()));
  expect(created.map((line) => line.trim()).toSorted()).toStrictEqual(['false', 'false', 'false', 'false', 'false', 'false', 'false', 'false', 'false', 'false', 'false', 'true']);
});

test('an existing password file is tightened to 0600', () => {
  mkdirSync(`${dir}/cfg`, { recursive: true });
  writeFileSync(requireEnv('HQ_BACKUP_PASSWORD_FILE'), 'invented-key\n');
  chmodSync(requireEnv('HQ_BACKUP_PASSWORD_FILE'), 0o644);
  expect(ensurePassword().created).toBe(false);
  expect(statSync(requireEnv('HQ_BACKUP_PASSWORD_FILE')).mode & 0o777).toBe(0o600);
});
