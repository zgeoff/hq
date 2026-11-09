// oxlint-disable zgeoff/test-beside-module -- runs the whole migration list, which no single module owns
import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
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

test('v17 adds the probe tables and allows one open outage', () => {
  const ctx = setupTest();
  const path = `${ctx.directory}/v16.db`;
  const v16 = new Database(path, { create: true });
  migrate(v16, path, false, MIGRATIONS.slice(0, 16));
  v16.close();
  const db = openDb(path);
  const add = db.query(`INSERT INTO outages (started_at, detected_at, ended_at) VALUES ('2026-10-16T00:00:00Z', '2026-10-16T00:01:00Z', ?)`);
  add.run('2026-10-16T00:05:00Z');
  add.run('2026-10-16T00:06:00Z');
  add.run(null);
  expect(() => add.run(null)).toThrow();
  db.query(`INSERT INTO probe_samples (at, target_ok) VALUES ('2026-10-16T00:00:00Z', 1)`).run();
  expect(() => db.query(`INSERT INTO probe_samples (at, target_ok) VALUES ('2026-10-16T00:00:00Z', 0)`).run()).toThrow();
  db.close();
});

test('v18 adds a news tag and the usage samples', () => {
  const ctx = setupTest();
  const path = `${ctx.directory}/v17.db`;
  const v17 = new Database(path, { create: true });
  migrate(v17, path, false, MIGRATIONS.slice(0, 17));
  v17.query(`INSERT INTO news (from_name, topic, text, added_at) VALUES ('z-stu', 'fix', 'Kept across the upgrade.', '2026-10-16T00:00:00Z')`).run();
  v17.close();
  const db = openDb(path);
  expect(db.query('SELECT text, tag FROM news').all()).toEqual([{ text: 'Kept across the upgrade.', tag: null }]);
  db.query(`INSERT INTO news (from_name, topic, text, added_at, tag) VALUES ('z-stu', 'fix', 'Tagged.', '2026-10-16T00:00:00Z', 'weekly-flag')`).run();
  db.query(`INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES ('2026-10-16T00:00:00Z', 'active', 10, 20)`).run();
  db.query(`INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES ('2026-10-16T00:00:00Z', 'abc', NULL, NULL)`).run();
  expect(() => db.query(`INSERT INTO usage_samples (at, account) VALUES ('2026-10-16T00:00:00Z', 'active')`).run()).toThrow();
  expect(() => db.query(`INSERT INTO usage_samples (at) VALUES ('2026-10-16T00:00:01Z')`).run()).toThrow();
  expect(userVersion(db)).toBeGreaterThanOrEqual(18);
  db.close();
});

test('v19 adds ready_ok and an outage kind, with one open outage per kind', () => {
  const ctx = setupTest();
  const path = `${ctx.directory}/v18.db`;
  const v18 = new Database(path, { create: true });
  migrate(v18, path, false, MIGRATIONS.slice(0, 18));
  v18.query(`INSERT INTO outages (started_at, detected_at) VALUES ('2026-10-16T00:00:00Z', '2026-10-16T00:01:00Z')`).run();
  v18.query(`INSERT INTO probe_samples (at, target_ok) VALUES ('2026-10-16T00:00:00Z', 1)`).run();
  v18.close();
  const db = openDb(path);
  expect(db.query('SELECT kind, ended_at FROM outages').all()).toEqual([{ kind: 'down', ended_at: null }]);
  expect(db.query('SELECT target_ok, ready_ok FROM probe_samples').all()).toEqual([{ target_ok: 1, ready_ok: null }]);
  const add = db.query(`INSERT INTO outages (started_at, detected_at, kind) VALUES ('2026-10-16T00:02:00Z', '2026-10-16T00:05:00Z', ?)`);
  add.run('unready');
  expect(() => add.run('unready')).toThrow();
  expect(() => add.run('down')).toThrow();
  expect(() => add.run('sideways')).toThrow();
  expect(userVersion(db)).toBeGreaterThanOrEqual(19);
  db.close();
});
