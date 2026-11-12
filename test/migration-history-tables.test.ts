// oxlint-disable zgeoff/test-beside-module -- runs the whole migration list, which no single module owns
import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { migrate } from '../src/db/migrate.ts';
import { MIGRATIONS } from '../src/db/migrations.ts';
import { openDb } from '../src/db/open-db.ts';
import { userVersion } from '../src/db/user-version.ts';
import { freshDb } from './helpers.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);

  return { directory: fresh.dir };
}

test('v28 keeps every typed row and id, and then takes a console source', () => {
  const ctx = setupTest();
  const file = `${ctx.directory}/v27.db`;
  const rows = createV27TypedRows(file);
  const upgraded = openDb(file);
  expect(upgraded.query('SELECT * FROM typed ORDER BY id').all()).toStrictEqual(rows);

  // An old schema that no current owner can write: this migration test builds it by hand.
  upgraded.query(`INSERT INTO typed (to_session, text, source_kind, source_ref, typed_by, at) VALUES ('z-invented', 'Descale it.', 'console', 'descale-kettle', 'stu', '2026-10-15T01:00:00Z')`).run();
  expect(upgraded.query('SELECT id, source_kind FROM typed ORDER BY id').all()).toStrictEqual([
    { id: 1, source_kind: 'call' },
    { id: 3, source_kind: 'chat' },
    { id: 4, source_kind: 'console' },
  ]);
  upgraded.close();
});

test('v22 adds the refusal log tables, backing hq.db up first', () => {
  const ctx = setupTest();
  const file = `${ctx.directory}/v21.db`;
  const v21 = new Database(file, { create: true });
  migrate(v21, file, false, MIGRATIONS.slice(0, 21));
  v21.exec("CREATE TABLE keepsake (note TEXT); INSERT INTO keepsake VALUES ('kettle')");
  v21.close();
  const db = openDb(file);
  const backup = readdirSync(ctx.directory).find((name) => name.startsWith('v21.db.bak-v21-'));
  expect(backup).toBeDefined();
  const old = new Database(`${ctx.directory}/${backup}`, { readonly: true });
  expect(old.query('SELECT note FROM keepsake').get()).toEqual({ note: 'kettle' });
  old.close();
  db.query(`INSERT INTO refusals (uuid, at, subagent, transcript, scanned_at) VALUES ('u1', '2026-10-17T00:00:00Z', 0, '/t.jsonl', '2026-10-17T00:00:00Z')`).run();
  expect(() => db.query(`INSERT INTO refusals (uuid, at, subagent, transcript, scanned_at) VALUES ('u1', '2026-10-17T00:00:00Z', 0, '/t.jsonl', '2026-10-17T00:00:00Z')`).run()).toThrow();
  db.query(`INSERT INTO refusal_files (path, offset, size, mtime) VALUES ('/t.jsonl', 5, 9, '2026-10-17T00:00:00Z')`).run();
  expect(userVersion(db)).toBeGreaterThanOrEqual(22);
  db.close();
});

test('it adds deploy_runs at v21, with a checked outcome and one row per run', () => {
  const ctx = setupTest();
  const file = `${ctx.directory}/v20.db`;
  const v20 = new Database(file, { create: true });
  migrate(v20, file, false, MIGRATIONS.slice(0, 20));
  v20.close();
  const db = openDb(file);
  const add = db.query(`INSERT INTO deploy_runs (run_id, outcome, attempt, apply_conclusion, failed_step, fetched_at) VALUES (?, ?, 1, 'failure', 'Hold for a manual dispatch', '2026-10-17T00:00:00Z')`);
  add.run(5001, 'held');
  expect(() => add.run(5001, 'held')).toThrow();
  expect(() => add.run(5002, 'sideways')).toThrow();
  for (const o of ['applied_ok', 'applied_failed', 'no_apply', 'cancelled', 'unknown']) add.run(6000 + o.length, o);
  expect(db.query('SELECT outcome FROM deploy_runs WHERE run_id = 5001').get()).toEqual({ outcome: 'held' });
  expect(userVersion(db)).toBeGreaterThanOrEqual(21);
  db.close();
});

function createV27TypedRows(file: string): unknown[] {
  const v27 = new Database(file, { create: true });
  try {
    migrate(v27, file, false, MIGRATIONS.slice(0, 27));
    v27.exec(`INSERT INTO typed (to_session, to_id, to_name, text, source_kind, source_ref, source_at, typed_by, at) VALUES
      ('z-invented', 'aaaaaaaa-0000-4000-8000-000000000001', 'z-invented', 'Red, please.', 'call', 'kettle-colour', NULL, 'stu', '2026-10-15T00:00:00Z'),
      ('z-invented', NULL, NULL, 'Hinge it.', 'proposal', 'teapot-lid', NULL, 'stu', '2026-10-15T00:00:00Z'),
      ('z-invented', NULL, NULL, 'Ship it.', 'chat', 'bbbbbbbb-0000-4000-8000-000000000002', '2026-10-14T23:59:00Z', 'stu', '2026-10-15T00:00:00Z');
      DELETE FROM typed WHERE id = 2;`);
    expect(() => v27.exec(`INSERT INTO typed (to_session, text, source_kind, source_ref, typed_by, at) VALUES ('z-invented', 'Too early.', 'console', 'kettle-colour', 'stu', '2026-10-15T00:00:00Z')`)).toThrow();
    return v27.query('SELECT * FROM typed ORDER BY id').all();
  } finally {
    v27.close();
  }
}
