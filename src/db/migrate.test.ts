import { expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from './migrate.ts';
import { MIGRATIONS } from './migrations.ts';

// A scratch folder with a child script that opens and migrates the database it is given, the way an
// hq command does after an install, and 4 database paths in it.
async function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hq-migrate-')),
    paths = [0, 1, 2, 3].map((round) => join(dir, `hq-${round}.db`)),
    script = join(dir, 'child.ts');
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  await Bun.write(script, `import { openDb } from ${JSON.stringify(join(import.meta.dir, 'open-db.ts'))};\nconsole.log(openDb(process.argv[2]).query('PRAGMA user_version').get().user_version);\n`);
  return { paths, script };
}

test.each([
  ['5 versions behind', true, 4],
  ['not yet created', false, 0],
])('4 migrators started at once against one database %s all finish at the newest schema, 4 times over', async (_case, isBehind, seeded) => {
  const app = await setupTest(),
    behind = app.paths.filter(() => isBehind).map((path) => {
      const db = new Database(path, { create: true, strict: true });
      db.exec('PRAGMA journal_mode = WAL;');
      migrate(db, path, false, MIGRATIONS.slice(0, -5));
      db.close();
      return path;
    }),
    children = app.paths.flatMap((path) => [0, 1, 2, 3].map(() => Bun.spawn(['bun', app.script, path], { stdout: 'pipe', stderr: 'pipe' }))),
    codes = await Promise.all(children.map(async (child) => await child.exited)),
    stderrs = await Promise.all(children.map(async (child) => await new Response(child.stderr).text().then((text) => text.trim()))),
    versions = await Promise.all(children.map(async (child) => await new Response(child.stdout).text().then((text) => text.trim())));

  expect({ seeded: behind.length, codes, stderrs, versions }).toStrictEqual({ seeded, codes: children.map(() => 0), stderrs: children.map(() => ''), versions: children.map(() => String(MIGRATIONS.length)) });
}, 60_000);

test('v35 adds the pr_status table and keeps the rows already in the database', () => {
  const base = mkdtempSync(join(tmpdir(), 'hq-migrate-v35-')),
    db = new Database(join(base, 'hq.db'), { create: true, strict: true }),
    path = join(base, 'hq.db');
  onTestFinished(() => rmSync(base, { recursive: true, force: true }));
  onTestFinished(() => db.close());
  db.exec('PRAGMA journal_mode = WAL;');
  migrate(db, path, false, MIGRATIONS.slice(0, 34));
  db.query("INSERT INTO events (subject, subject_id, action, actor, at, data) VALUES ('hq', 'kettle', 'boil', 'z-kettle', '2026-10-14T01:00:00Z', '{}')").run();

  expect(migrate(db, path, true, MIGRATIONS.slice(0, 35))).not.toBeNull();
  expect(db.query('SELECT subject_id, action FROM events').all()).toStrictEqual([{ subject_id: 'kettle', action: 'boil' }]);
  expect(db.query('SELECT name FROM pragma_table_info(\'pr_status\') ORDER BY cid').all()).toStrictEqual(
    ['repo', 'pr', 'head', 'gate', 'gate_head', 'gate_at', 'answer', 'answer_head', 'answer_source', 'answer_note', 'answer_at', 'next', 'next_at', 'updated_at'].map((name) => ({ name })),
  );
});

test('v36 adds the shipped_cache table and keeps the rows already in the database', () => {
  const base = mkdtempSync(join(tmpdir(), 'hq-migrate-v36-')),
    db = new Database(join(base, 'hq.db'), { create: true, strict: true }),
    path = join(base, 'hq.db');
  onTestFinished(() => rmSync(base, { recursive: true, force: true }));
  onTestFinished(() => db.close());
  db.exec('PRAGMA journal_mode = WAL;');
  migrate(db, path, false, MIGRATIONS.slice(0, 35));
  db.query("INSERT INTO pr_status (repo, pr, updated_at) VALUES ('kettle', 7, '2026-10-14T01:00:00Z')").run();

  expect(migrate(db, path, true, MIGRATIONS.slice(0, 36))).not.toBeNull();
  expect(db.query('SELECT repo, pr FROM pr_status').all()).toStrictEqual([{ repo: 'kettle', pr: 7 }]);
  expect(db.query("SELECT name FROM pragma_table_info('shipped_cache') ORDER BY cid").all()).toStrictEqual(['kind', 'key', 'body', 'fetched_at', 'expires_at'].map((name) => ({ name })));
  expect((db.query('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(36);
});

test('it adds done_when to unblocks in v37, keeps every row, and makes v37 the newest schema', () => {
  const base = mkdtempSync(join(tmpdir(), 'hq-migrate-v37-'));
  const db = new Database(join(base, 'hq.db'), { create: true, strict: true });
  const path = join(base, 'hq.db');
  onTestFinished(() => rmSync(base, { recursive: true, force: true }));
  onTestFinished(() => db.close());
  db.exec('PRAGMA journal_mode = WAL;');
  migrate(db, path, false, MIGRATIONS.slice(0, 36));
  db.query(
    "INSERT INTO unblocks (id, task, unblocks, notify, added_by, state, added_seq, added_at, updated_at) VALUES ('kettle', 'Descale the kettle', '[]', '[]', 'kettle-triage', 'open', 1, '2026-10-14T01:00:00Z', '2026-10-14T01:00:00Z')",
  ).run();

  expect(migrate(db, path, true)).not.toBeNull();
  expect(db.query('SELECT id, task, state, done_when FROM unblocks').all()).toStrictEqual([{ id: 'kettle', task: 'Descale the kettle', state: 'open', done_when: null }]);
  expect(db.query('PRAGMA user_version').get()).toStrictEqual({ user_version: 37 });
});
