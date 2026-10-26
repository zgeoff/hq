// oxlint-disable zgeoff/test-beside-module -- grandfathered: the whole-program CLI suite
import { afterEach, beforeEach, expect, onTestFinished, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { chmodSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { closePr } from '../src/runs/close-pr.ts';
import { main } from '../src/cli.ts';
import { getMeta } from '../src/db/get-meta.ts';
import { migrate } from '../src/db/migrate.ts';
import { MIGRATIONS } from '../src/db/migrations.ts';
import { openDb } from '../src/db/open-db.ts';
import { setMeta } from '../src/db/set-meta.ts';
import { startStubAtcDaemon } from './start-stub-atc-daemon.ts';
import { OWNER_PROBE_OPENER } from '../src/pr-status/owner-probe-opener.ts';
import { overrideEnv } from '../src/config/override-env.ts';
import { isHeatList } from '../mods/hq-band/hooks/is-heat-list.ts';
import { isSegmentList } from '../mods/hq-band/hooks/is-segment-list.ts';
import type { Band, Pane } from '../src/band/types.ts';
import { NOON_SYDNEY, at, freshDb } from './helpers.ts';

let dir: string;
let path: string;
let cleanup: () => void;
let out: string[];
const origLog = console.log;
const origErr = console.error;

beforeEach(() => {
  ({ dir, path, cleanup } = freshDb());
  at(NOON_SYDNEY);
  process.env['HQ_NOTIFY'] = 'off';
  process.env['HQ_AS'] = 'z-stu';
  out = [];
  console.log = (s: string) => out.push(s);
  console.error = (s: string) => out.push(s);
});
afterEach(() => {
  console.log = origLog;
  console.error = origErr;
  cleanup();
});

const db = () => openDb(path);
const hq = async (...argv: string[]) => {
  out = [];
  const code = await main([...argv, '--json']);
  return { code, json: JSON.parse(out.join('\n')) };
};

test('a call goes queued, open, answered, applied through the CLI', async () => {
  expect((await hq('call', 'add', 'geo-1-paint', '--title', 'Paint', '--question', 'Green?', '--body', 'Invented.', '--issues', 'GEO-1')).json.result).toBe('added');
  expect((await hq('open')).json.item.id).toBe('geo-1-paint');
  expect((await hq('status')).json.open.id).toBe('geo-1-paint');
  expect((await hq('call', 'answer', 'geo-1-paint', '--answer', 'yes please')).json.call.answer).toBe('yes please');
  const applied = await hq('call', 'apply', 'geo-1-paint', '--to', 'typed:z-delivery');
  expect(applied.json.call.state).toBe('applied');
  expect((await hq('status')).json.open).toBeNull();
});

test('the retired hq noslop backfill is refused with bad_args and a nonzero exit', async () => {
  const r = await hq('noslop', 'backfill');
  expect(r.code).not.toBe(0);
  expect(r.json.error.code).toBe('bad_args');
});

test('errors have one JSON shape and a nonzero exit', async () => {
  await hq('call', 'add', 'geo-1-paint', '--title', 'Paint', '--question', 'Green?', '--body', 'Invented.');
  await hq('open');
  await hq('proposal', 'add', 'tidy', '--title', 'Tidy', '--question', 'Ok?', '--body', 'Invented.');
  const r = await hq('proposal', 'open');
  expect(r.code).toBe(1);
  expect(r.json).toEqual({ ok: false, error: { code: 'already_open', message: expect.any(String), open: 'geo-1-paint' } });
  expect((await hq('call', 'add', '--nope')).json.error.code).toBe('bad_args');
});

test('status names why the next item waits', async () => {
  await hq('call', 'add', 'geo-1-paint', '--title', 'Paint', '--question', 'Green?', '--body', 'Invented.');
  await hq('hold', '--reason', 'the owner is mid-intake');
  const s = (await hq('status')).json;
  expect(s.next.id).toBe('geo-1-paint');
  expect(s.waits).toEqual(['held: the owner is mid-intake']);
  await hq('release');
  expect((await hq('status')).json.waits).toEqual([]);
});

test('status counts a watch apart from the open items that need the owner', async () => {
  await hq('unblock', 'add', '--id', 'descale', '--task', 'Descale the kettle');
  await hq('unblock', 'add', '--id', 'kettle-release', '--task', 'Live-check the kettle release', '--kind', 'watch', '--done-when', 'release:kettle-co/kettle');

  const status = await hq('status');

  expect(status.json.unblock).toStrictEqual({ open: 1, newSincePush: 1, watching: 1 });
});

test('unblock add, list, new, pushed', async () => {
  await hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle', '--minutes', '5', '--unblocks', 'GEO-2:high');
  expect((await hq('unblock', 'list')).json.items).toHaveLength(1);
  expect((await hq('unblock', 'new')).json.items).toHaveLength(1);
  const upto = (await hq('unblock', 'new')).json.upto;
  expect((await hq('unblock', 'pushed')).json.error.code).toBe('bad_args');
  expect((await hq('unblock', 'pushed', '--upto', String(upto))).json.covered).toBe(1);
  expect((await hq('unblock', 'new')).json.items).toHaveLength(0);
  await hq('unblock', 'done', 'kettle');
  const again = await hq('unblock', 'add', '--id', 'kettle-2', '--task', 'Try the kettle again', '--unblocks', 'GEO-2:high');
  expect(again.json.warnings).toEqual([expect.objectContaining({ issue: 'GEO-2', id: 'kettle', state: 'done' })]);
});

test('it stores each --done-when condition of hq unblock add', async () => {
  const added = await hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle', '--done-when', 'issue:ket-7', '--done-when', 'pr:kettle#4');

  expect(added.json.item.done_when).toStrictEqual([
    { kind: 'issue', ref: 'KET-7' },
    { kind: 'pr', ref: 'zgeoff/kettle#4' },
  ]);
});

test('it lists the conditions of an item in hq unblock list --json', async () => {
  await hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle', '--done-when', 'issue:ket-7', '--done-when', 'pr:kettle#4');

  const listed = await hq('unblock', 'list');

  expect(listed.json.items[0].done_when).toStrictEqual([
    { kind: 'issue', ref: 'KET-7' },
    { kind: 'pr', ref: 'zgeoff/kettle#4' },
  ]);
});

test('it prints the conditions of an item in hq unblock show', async () => {
  await hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle', '--done-when', 'issue:ket-7', '--done-when', 'pr:kettle#4');
  out = [];

  await main(['unblock', 'show', 'kettle']);

  expect(out).toStrictEqual(['Try the kettle · done when issue:KET-7, pr:zgeoff/kettle#4 · added 2026-10-14T01:00:00Z · id kettle']);
});

test('it refuses a bad --done-when of hq unblock add as bad_args and adds nothing', async () => {
  const added = await hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle', '--done-when', 'foo:1');
  const listed = await hq('unblock', 'list');

  expect(added.json.error.code).toBe('bad_args');
  expect(listed.json.items).toStrictEqual([]);
});

test('it adds conditions to an open item with hq unblock done-when', async () => {
  await hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle');

  const added = await hq('unblock', 'done-when', 'kettle', 'doc:descaling-plan-abc123def456', 'issue:KET-7');

  expect(added.json.item.done_when).toStrictEqual([
    { kind: 'doc', ref: 'descaling-plan-abc123def456' },
    { kind: 'issue', ref: 'KET-7' },
  ]);
});

test('it refuses hq unblock done-when with no condition as bad_args', async () => {
  await hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle');

  const none = await hq('unblock', 'done-when', 'kettle');

  expect(none.json.error.code).toBe('bad_args');
});

test('it refuses hq unblock done-when on a closed item as bad_state', async () => {
  await hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle');
  await hq('unblock', 'done', 'kettle');

  const closed = await hq('unblock', 'done-when', 'kettle', 'issue:KET-8');

  expect(closed.json.error.code).toBe('bad_state');
});

test('it marks an item with no condition as recheck in hq unblock list after 3 days', async () => {
  await hq('unblock', 'add', '--id', 'plain', '--task', 'Try the kettle');
  at('2026-10-17T02:00:00Z');

  const listed = await hq('unblock', 'list');

  expect(listed.json.items).toStrictEqual([
    {
      id: 'plain',
      task: 'Try the kettle',
      minutes: null,
      unblocks: [],
      rank: null,
      notify: [],
      added_by: 'z-stu',
      state: 'open',
      added_seq: 1,
      added_at: '2026-10-14T01:00:00Z',
      closed_at: null,
      note: null,
      updated_at: '2026-10-14T01:00:00Z',
      item: null,
      title: null,
      due_at: null,
      done_when: [],
      kind: 'owner',
      deadline: null,
      overdue_told_at: null,
      recheck: true,
      overdue: false,
    },
  ]);
});

test('it does not mark an item with no condition as recheck in hq unblock list at 2 days', async () => {
  await hq('unblock', 'add', '--id', 'plain', '--task', 'Try the kettle');
  at('2026-10-16T01:00:00Z');

  const listed = await hq('unblock', 'list');

  expect(listed.json.items).toStrictEqual([
    {
      id: 'plain',
      task: 'Try the kettle',
      minutes: null,
      unblocks: [],
      rank: null,
      notify: [],
      added_by: 'z-stu',
      state: 'open',
      added_seq: 1,
      added_at: '2026-10-14T01:00:00Z',
      closed_at: null,
      note: null,
      updated_at: '2026-10-14T01:00:00Z',
      item: null,
      title: null,
      due_at: null,
      done_when: [],
      kind: 'owner',
      deadline: null,
      overdue_told_at: null,
      recheck: false,
      overdue: false,
    },
  ]);
});

test('it never marks an item with a condition as recheck in hq unblock list', async () => {
  await hq('unblock', 'add', '--id', 'waiting', '--task', 'Try the teapot', '--done-when', 'issue:KET-7');
  at('2026-10-17T02:00:00Z');

  const listed = await hq('unblock', 'list');

  expect(listed.json.items).toStrictEqual([
    {
      id: 'waiting',
      task: 'Try the teapot',
      minutes: null,
      unblocks: [],
      rank: null,
      notify: [],
      added_by: 'z-stu',
      state: 'open',
      added_seq: 1,
      added_at: '2026-10-14T01:00:00Z',
      closed_at: null,
      note: null,
      updated_at: '2026-10-14T01:00:00Z',
      item: null,
      title: null,
      due_at: null,
      done_when: [{ kind: 'issue', ref: 'KET-7' }],
      kind: 'owner',
      deadline: null,
      overdue_told_at: null,
      recheck: false,
      overdue: false,
    },
  ]);
});

test('it prints recheck after an item that needs one in hq unblock list', async () => {
  await hq('unblock', 'add', '--id', 'plain', '--task', 'Try the kettle');
  at('2026-10-17T02:00:00Z');
  out = [];

  await main(['unblock', 'list']);

  expect(out).toStrictEqual(['Try the kettle · added 2026-10-14T01:00:00Z · id plain · recheck']);
});

test('a schema upgrade backs up the live database first', () => {
  const db = openDb(path);
  db.exec(`INSERT INTO meta (key, value) VALUES ('marker', 'kept')`);
  const backup = migrate(db, path, true, [...MIGRATIONS, 'CREATE TABLE gadgets (name TEXT)']);
  db.close();
  expect(backup).toMatch(new RegExp(`hq\\.db\\.bak-v${MIGRATIONS.length}-`));
  const copy = new Database(backup!, { readonly: true });
  expect((copy.query('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.length);
  expect(copy.query(`SELECT value FROM meta WHERE key='marker'`).get()).toEqual({ value: 'kept' });
  copy.close();
});

test('an older hq refuses a newer database', () => {
  const db = openDb(path);
  db.exec('PRAGMA user_version = 99');
  db.close();
  expect(() => openDb(path)).toThrow('install a newer hq');
});

test('migrating from v1 backs up first and runs each later step', () => {
  const p1 = `${dir}/v1.db`;
  const v1 = new Database(p1, { create: true });
  migrate(v1, p1, false, MIGRATIONS.slice(0, 1));
  v1.close();
  const db = openDb(p1);
  expect((db.query('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.length);
  db.close();
  expect(readdirSync(dir).some((f) => f.startsWith('v1.db.bak-v1-'))).toBe(true);
});

test('v28 keeps every typed row and id, and then takes a console source', () => {
  const file = `${dir}/v27.db`,
    rows = createV27TypedRows(file),
    upgraded = openDb(file);
  expect(upgraded.query('SELECT * FROM typed ORDER BY id').all()).toStrictEqual(rows);
  upgraded.query(`INSERT INTO typed (to_session, text, source_kind, source_ref, typed_by, at) VALUES ('z-invented', 'Descale it.', 'console', 'descale-kettle', 'z-stu', '2026-10-15T01:00:00Z')`).run();
  expect(upgraded.query('SELECT id, source_kind FROM typed ORDER BY id').all()).toStrictEqual([
    { id: 1, source_kind: 'call' },
    { id: 3, source_kind: 'chat' },
    { id: 4, source_kind: 'console' },
  ]);
  upgraded.close();
});

test('v15 rebuilds news with every row, its read state and its id sequence, and takes report', () => {
  const p = `${dir}/v14.db`;
  const v14 = new Database(p, { create: true });
  migrate(v14, p, false, MIGRATIONS.slice(0, 14));
  const add = v14.query(`INSERT INTO news (from_name, topic, text, added_at, read_at, needs_geoff) VALUES ('z-invented', ?, ?, '2026-10-15T00:00:00Z', ?, ?)`);
  add.run('merge', 'an invented merge', null, 1);
  add.run('other', 'an invented note', '2026-10-15T01:00:00Z', 0);
  add.run('fix', 'deleted later', null, 0);
  v14.exec(`DELETE FROM news WHERE id = 3`);
  expect(() => add.run('report', 'too early', null, 0)).toThrow();
  v14.close();
  const db = openDb(p);
  expect(db.query('SELECT id, topic, text, read_at, needs_geoff FROM news ORDER BY id').all()).toEqual([
    { id: 1, topic: 'merge', text: 'an invented merge', read_at: null, needs_geoff: 1 },
    { id: 2, topic: 'other', text: 'an invented note', read_at: '2026-10-15T01:00:00Z', needs_geoff: 0 },
  ]);
  db.query(`INSERT INTO news (from_name, topic, text, added_at) VALUES ('z-invented', 'report', 'an invented report', '2026-10-16T00:00:00Z')`).run();
  expect(db.query(`SELECT id FROM news WHERE topic = 'report'`).get()).toEqual({ id: 4 }); // 3 is never reused
  expect(db.query(`SELECT name FROM sqlite_master WHERE name LIKE 'news%' ORDER BY name`).all()).toEqual([{ name: 'news' }, { name: 'news_unread' }]);
  expect(() => db.query(`INSERT INTO news (from_name, topic, text, added_at) VALUES ('z', 'gossip', 't', 't')`).run()).toThrow();
  db.close();
});

test('v17 adds the probe tables and allows one open outage', () => {
  const p = `${dir}/v16.db`;
  const v16 = new Database(p, { create: true });
  migrate(v16, p, false, MIGRATIONS.slice(0, 16));
  v16.close();
  const db = openDb(p);
  const add = db.query(`INSERT INTO outages (started_at, detected_at, ended_at) VALUES ('2026-10-16T00:00:00Z', '2026-10-16T00:01:00Z', ?)`);
  add.run('2026-10-16T00:05:00Z');
  add.run('2026-10-16T00:06:00Z'); // closed ones can repeat
  add.run(null);
  expect(() => add.run(null)).toThrow();
  db.query(`INSERT INTO probe_samples (at, target_ok) VALUES ('2026-10-16T00:00:00Z', 1)`).run();
  expect(() => db.query(`INSERT INTO probe_samples (at, target_ok) VALUES ('2026-10-16T00:00:00Z', 0)`).run()).toThrow();
  db.close();
});

test('v18 adds a news tag and the usage samples', () => {
  const p = `${dir}/v17.db`;
  const v17 = new Database(p, { create: true });
  migrate(v17, p, false, MIGRATIONS.slice(0, 17));
  v17.query(`INSERT INTO news (from_name, topic, text, added_at) VALUES ('z-stu', 'fix', 'Kept across the upgrade.', '2026-10-16T00:00:00Z')`).run();
  v17.close();
  const db = openDb(p);
  expect(db.query('SELECT text, tag FROM news').all()).toEqual([{ text: 'Kept across the upgrade.', tag: null }]);
  db.query(`INSERT INTO news (from_name, topic, text, added_at, tag) VALUES ('z-stu', 'fix', 'Tagged.', '2026-10-16T00:00:00Z', 'weekly-flag')`).run();
  db.query(`INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES ('2026-10-16T00:00:00Z', 'active', 10, 20)`).run();
  db.query(`INSERT INTO usage_samples (at, account, five_hour, seven_day) VALUES ('2026-10-16T00:00:00Z', 'abc', NULL, NULL)`).run();
  expect(() => db.query(`INSERT INTO usage_samples (at, account) VALUES ('2026-10-16T00:00:00Z', 'active')`).run()).toThrow();
  expect(() => db.query(`INSERT INTO usage_samples (at) VALUES ('2026-10-16T00:00:01Z')`).run()).toThrow();
  expect((db.query('PRAGMA user_version').get() as { user_version: number }).user_version).toBeGreaterThanOrEqual(18);
  db.close();
});

test('v19 adds ready_ok and an outage kind, with one open outage per kind', () => {
  const p = `${dir}/v18.db`;
  const v18 = new Database(p, { create: true });
  migrate(v18, p, false, MIGRATIONS.slice(0, 18));
  v18.query(`INSERT INTO outages (started_at, detected_at) VALUES ('2026-10-16T00:00:00Z', '2026-10-16T00:01:00Z')`).run();
  v18.query(`INSERT INTO probe_samples (at, target_ok) VALUES ('2026-10-16T00:00:00Z', 1)`).run();
  v18.close();
  const db = openDb(p);
  expect(db.query('SELECT kind, ended_at FROM outages').all()).toEqual([{ kind: 'down', ended_at: null }]);
  expect(db.query('SELECT target_ok, ready_ok FROM probe_samples').all()).toEqual([{ target_ok: 1, ready_ok: null }]);
  const add = db.query(`INSERT INTO outages (started_at, detected_at, kind) VALUES ('2026-10-16T00:02:00Z', '2026-10-16T00:05:00Z', ?)`);
  add.run('unready'); // a down and an unready outage can be open together
  expect(() => add.run('unready')).toThrow();
  expect(() => add.run('down')).toThrow();
  expect(() => add.run('sideways')).toThrow();
  expect((db.query('PRAGMA user_version').get() as { user_version: number }).user_version).toBeGreaterThanOrEqual(19);
  db.close();
});

test('v22 adds the refusal log tables, backing hq.db up first', () => {
  const p = `${dir}/v21.db`;
  const v21 = new Database(p, { create: true });
  migrate(v21, p, false, MIGRATIONS.slice(0, 21));
  v21.exec("CREATE TABLE keepsake (note TEXT); INSERT INTO keepsake VALUES ('kettle')");
  v21.close();
  const db = openDb(p);
  const bak = readdirSync(dir).find((f) => f.startsWith('v21.db.bak-v21-'));
  expect(bak).toBeDefined();
  const old = new Database(`${dir}/${bak}`, { readonly: true });
  expect(old.query('SELECT note FROM keepsake').get()).toEqual({ note: 'kettle' });
  old.close();
  db.query(`INSERT INTO refusals (uuid, at, subagent, transcript, scanned_at) VALUES ('u1', '2026-10-17T00:00:00Z', 0, '/t.jsonl', '2026-10-17T00:00:00Z')`).run();
  expect(() => db.query(`INSERT INTO refusals (uuid, at, subagent, transcript, scanned_at) VALUES ('u1', '2026-10-17T00:00:00Z', 0, '/t.jsonl', '2026-10-17T00:00:00Z')`).run()).toThrow();
  db.query(`INSERT INTO refusal_files (path, offset, size, mtime) VALUES ('/t.jsonl', 5, 9, '2026-10-17T00:00:00Z')`).run();
  expect((db.query('PRAGMA user_version').get() as { user_version: number }).user_version).toBeGreaterThanOrEqual(22);
  db.close();
});

test('v21 adds deploy_runs, with a checked outcome and one row per run', () => {
  const p = `${dir}/v20.db`;
  const v20 = new Database(p, { create: true });
  migrate(v20, p, false, MIGRATIONS.slice(0, 20));
  v20.close();
  const db = openDb(p);
  const add = db.query(`INSERT INTO deploy_runs (run_id, outcome, attempt, apply_conclusion, failed_step, fetched_at) VALUES (?, ?, 1, 'failure', 'Hold for a manual dispatch', '2026-10-17T00:00:00Z')`);
  add.run(5001, 'held');
  expect(() => add.run(5001, 'held')).toThrow();
  expect(() => add.run(5002, 'sideways')).toThrow();
  for (const o of ['applied_ok', 'applied_failed', 'no_apply', 'cancelled', 'unknown']) add.run(6000 + o.length, o);
  expect(db.query('SELECT outcome FROM deploy_runs WHERE run_id = 5001').get()).toEqual({ outcome: 'held' });
  expect((db.query('PRAGMA user_version').get() as { user_version: number }).user_version).toBeGreaterThanOrEqual(21);
  db.close();
});

test('hq probe status shows the last ready check and the unready episodes', async () => {
  const d = db();
  d.query(`INSERT INTO probe_samples (at, target_ok, control_ok, ready_ok) VALUES ('2026-10-14T00:59:00Z', 1, NULL, 0)`).run();
  d.query(`INSERT INTO probe_samples (at, target_ok, control_ok, ready_ok) VALUES ('2026-10-14T01:00:00Z', 0, 1, NULL)`).run(); // newer, down: ready not checked
  d.query(`INSERT INTO outages (started_at, detected_at, kind) VALUES ('2026-10-14T00:55:00Z', '2026-10-14T00:59:00Z', 'unready')`).run();
  d.close();
  const r = await hq('probe', 'status');
  expect(r.json.openUnready).toMatchObject({ kind: 'unready', started_at: '2026-10-14T00:55:00Z' });
  expect(r.json.open).toBeNull();
  expect(r.json.outages).toEqual([]);
  expect(r.json.unready).toHaveLength(1);
  expect(r.json.lastReady).toEqual({ at: '2026-10-14T00:59:00Z', ready_ok: 0 });
  expect(r.json.last).toMatchObject({ at: '2026-10-14T01:00:00Z', ready_ok: null });
  out = [];
  await main(['probe', 'status']);
  const text = out.join('\n');
  expect(text).toContain('last ready check: 2026-10-14T00:59:00Z (NOT ready)');
  expect(text).toContain('OPEN unready since 2026-10-14T00:55:00Z');
  expect(text).toContain('no open outage');
  expect(text).toContain('1 unready episode(s)');
});

test('hq goals target and targets, the daily dry run, and news --tag work through the CLI', async () => {
  expect((await hq('goals', 'targets')).json.overridden).toEqual([]);
  expect((await hq('goals', 'target', 'bugs', '<=', '15')).json.target).toMatchObject({ op: '<=', value: 15 });
  expect((await hq('goals', 'targets')).json.overridden).toEqual(['bugs']);
  expect((await hq('goals', 'target', 'cost', 'none')).json.target).toBeNull();
  const bad = await hq('goals', 'target', 'moon', '<', '5');
  expect(bad.code).not.toBe(0);
  expect(bad.json.error.code).toBe('bad_args');
  const dry = await hq('goals', 'daily', '--dry-run');
  expect(dry.json.dryRun).toBe(true);
  expect(dry.json.text).toContain('Goals check-in, Wed 14 Oct:');
  expect(db().query('SELECT COUNT(*) AS n FROM job_runs').get()).toEqual({ n: 0 });
  expect((await hq('goals', 'daily', 'skip', '2026-10-14', '--reason', 'by hand')).code).toBe(0);
  expect((await hq('news', 'add', '--topic', 'fix', '--text', 'Invented flag.', '--tag', 'weekly-flag')).json.news.tag).toBe('weekly-flag');
  expect((await hq('news', 'add', '--topic', 'fix', '--text', 'Invented flag.', '--tag', 'Bad Tag')).code).not.toBe(0);
  expect((await hq('news')).json.news[0].tag).toBe('weekly-flag');
});

test('hq goals weekly dry run and skip, and hq goals account, work through the CLI', async () => {
  const dry = await hq('goals', 'weekly', '--dry-run');
  expect(dry.json.dryRun).toBe(true);
  expect(dry.json.text).toContain('Goals weekly, week of 05 Oct:');
  expect(db().query('SELECT COUNT(*) AS n FROM job_runs').get()).toEqual({ n: 0 });
  expect(db().query('SELECT COUNT(*) AS n FROM outbox').get()).toEqual({ n: 0 });
  expect((await hq('goals', 'weekly', 'skip', '2026-10-12', '--reason', 'by hand')).code).toBe(0);
  expect((await hq('goals', 'weekly', 'skip', '2026-10-14', '--reason', 'by hand')).json.error.code).toBe('bad_args');
  expect((await hq('goals', 'account')).json.labels).toEqual({});
  expect((await hq('goals', 'account', 'abcdef012345', 'work')).json.name).toBe('work');
  expect((await hq('goals', 'account')).json.labels).toEqual({ abcdef012345: 'work' });
  expect((await hq('goals', 'account', 'geoff@example.com', 'work')).json.error.code).toBe('bad_args');
});

test('--version and version both answer', async () => {
  expect((await hq('--version')).json.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect((await hq('version')).code).toBe(0);
});

test('a run from source names no commit, whatever its environment holds', () => {
  const ran = Bun.spawnSync(['bun', 'src/cli.ts', 'version', '--json'], { env: { ...process.env, INSTALL_COMMIT: 'f'.repeat(40), INSTALL_DIRTY: 'false', HQ_BUILD: '{"commit":"x","dirty":false}' } });
  expect(JSON.parse(ran.stdout.toString())).toMatchObject({ commit: null, dirty: null });
});

test('version names no commit for a run from source', async () => {
  const result = await hq('version');
  expect(result.json).toMatchObject({ commit: null, dirty: null });
});

test('release without a hold changes nothing', async () => {
  expect((await hq('release')).json.released).toBe(false);
  await hq('hold', '--reason', 'busy');
  expect((await hq('release')).json.released).toBe(true);
});

test('status lists every later item', async () => {
  for (const id of ['a-one', 'b-two']) {
    await hq('call', 'add', id, '--title', 'T', '--question', `${id}?`, '--body', 'Invented.');
    await hq('call', 'later', id, '--until', '+4h');
  }
  const s = (await hq('status')).json;
  expect(s.later.map((l: { id: string }) => l.id)).toEqual(['a-one', 'b-two']);
});

test('hq run reopen brings a dropped run back to working, as the refusal says', async () => {
  await hq('run', 'add', 'GEO-508', '--title', 'Invented kettle work', '--where', 'none');
  await hq('run', 'pr', 'GEO-508', 'kettle#9');
  await hq('run', 'state', 'GEO-508', 'dropped', '--note', 'paused');
  const refused = await hq('run', 'add', 'GEO-508', '--title', 'Invented kettle work');
  expect(refused.json.error.message).toBe('GEO-508 is dropped: hq run reopen GEO-508');
  const r = await hq('run', 'reopen', 'GEO-508', '--next', 'Back on it.');
  expect(r.json.run).toMatchObject({ issue: 'GEO-508', state: 'working', next: 'Back on it.', closed_at: null });
  expect(r.json.run.prs.map((p: { ref: string }) => p.ref)).toEqual(['kettle#9']);
  expect((await hq('run', 'pr', 'GEO-508', 'kettle#10')).code).toBe(0);
  expect((await hq('run', 'reopen', 'GEO-508')).json.error.message).toBe('GEO-508 is working, not done or dropped: nothing to reopen');
  expect((await hq('run', 'reopen', 'GEO-404')).code).not.toBe(0);
});

test('it succeeds and changes nothing when hq run merged names a PR already marked merged', async () => {
  await hq('run', 'add', 'GEO-509', '--title', 'Invented kettle work', '--where', 'none');
  await hq('run', 'pr', 'GEO-509', 'kettle#11');
  closePr(db(), 'kettle#11', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-20T03:04:05Z', mergeSha: null } });
  const before = db().query("SELECT * FROM run_prs WHERE ref = 'kettle#11'").get();

  const again = await hq('run', 'merged', 'kettle#11');

  expect(again.code).toBe(0);
  expect(again.json.pr).toMatchObject({ ref: 'kettle#11', state: 'merged', merged_at: '2026-10-20T03:04:05Z' });
  expect(db().query("SELECT * FROM run_prs WHERE ref = 'kettle#11'").get()).toStrictEqual(before);
});

test('it still refuses hq run merged for a PR marked closed', async () => {
  await hq('run', 'add', 'GEO-509', '--title', 'Invented kettle work', '--where', 'none');
  await hq('run', 'pr', 'GEO-509', 'kettle#12');
  closePr(db(), 'kettle#12', { to: 'closed', actor: 'hq-github' });

  // A stand-in gh on PATH that confirms the merge, so only the closed row can make hq refuse.
  const path0 = process.env['PATH'];
  const bin = `${dir}/bin`;
  mkdirSync(bin);
  writeFileSync(`${bin}/gh`, ['#!/bin/sh', 'echo \'{"state":"MERGED"}\'', ''].join('\n'));
  chmodSync(`${bin}/gh`, 0o755);
  process.env['PATH'] = `${bin}:${path0}`;
  try {
    const again = await hq('run', 'merged', 'kettle#12');

    expect(again.code).not.toBe(0);
    expect(again.json.error).toMatchObject({ code: 'bad_state', message: 'kettle#12 is closed' });
    expect(db().query("SELECT state FROM run_prs WHERE ref = 'kettle#12'").get()).toStrictEqual({ state: 'closed' });
  } finally {
    process.env['PATH'] = path0;
  }
});

interface RunSessionRow {
  session_id: string;
}

test('hq run add refuses a session id given as a second word, and stores the run only with --session', async () => {
  const refused = await hq('run', 'add', 'GEO-9701', '9701ab0c-0000-4000-8000-00000000beef', '--title', 'Invented kettle work', '--where', 'none'),
    remaining = await hq('run', 'list'),
    stored = await hq('run', 'add', 'GEO-9701', '--session', '9701ab0c-0000-4000-8000-00000000beef', '--title', 'Invented kettle work', '--where', 'none');
  expect([refused.code, refused.json.error.message]).toEqual([1, 'hq run add takes one issue: pass the session as --session 9701ab0c-0000-4000-8000-00000000beef']);
  expect(remaining.json.runs).toEqual([]);
  expect((stored.json.run.sessions as RunSessionRow[]).map((x) => x.session_id)).toEqual(['9701ab0c-0000-4000-8000-00000000beef']);
});

test('v20 adds live_check to runs and the merge and release columns to run_prs', () => {
  const p = `${dir}/v19.db`;
  const v19 = new Database(p, { create: true });
  migrate(v19, p, false, MIGRATIONS.slice(0, 19));
  v19.query(`INSERT INTO runs (issue, title, place, state, next, created_at, updated_at) VALUES ('GEO-1', 'Invented kettle work', 'none', 'merged', 'x', '2026-10-16T00:00:00Z', '2026-10-16T00:00:00Z')`).run();
  v19.query(`INSERT INTO run_prs (ref, issue, state, added_at, updated_at) VALUES ('nixie#1', 'GEO-1', 'merged', '2026-10-16T00:00:00Z', '2026-10-16T00:00:00Z')`).run();
  v19.close();
  const db = openDb(p);
  expect(db.query('SELECT live_check FROM runs').all()).toEqual([{ live_check: null }]);
  expect(db.query('SELECT merge_sha, shipped_tag, shipped_at FROM run_prs').all()).toEqual([{ merge_sha: null, shipped_tag: null, shipped_at: null }]);
  db.query(`UPDATE runs SET live_check = 'none'`).run();
  expect(() => db.query(`UPDATE runs SET live_check = 'maybe'`).run()).toThrow();
  expect((db.query('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.length);
  expect(MIGRATIONS.length).toBeGreaterThanOrEqual(20);
  db.close();
});

test('hq run check and state --check set live_check, and show it', async () => {
  await hq('run', 'add', 'GEO-509', '--title', 'Invented kettle work', '--where', 'none');
  expect((await hq('run', 'check', 'GEO-509', 'none')).json.run.live_check).toBe('none');
  const s = await hq('run', 'state', 'GEO-509', 'deploying', '--check', 'owed');
  expect(s.json.run).toMatchObject({ state: 'deploying', live_check: 'owed' });
  expect((await hq('run', 'show', 'GEO-509')).json.run.live_check).toBe('owed');
  expect((await hq('run', 'check', 'GEO-509', 'maybe')).code).not.toBe(0);
  expect((await hq('run', 'state', 'GEO-509', 'deploying', '--check', 'maybe')).code).not.toBe(0);
});

test('hq run state refuses --check given twice, and leaves the run as it was', async () => {
  await hq('run', 'add', 'GEO-510', '--title', 'Invented kettle work', '--where', 'none');

  const refused = await hq('run', 'state', 'GEO-510', 'deploying', '--check', 'owed', '--check', 'none');
  const shown = await hq('run', 'show', 'GEO-510');

  expect(refused.json.error).toStrictEqual({ code: 'bad_args', message: 'give --check once, not 2 times' });
  expect(shown.json.run.state).toBe('working');
});

test('hq pr override refuses --check given twice', async () => {
  const refused = await hq('pr', 'override', 'widgets', '7', '--check', 'preview', '--check', 'test', '--source', 'chat:kettle-12', '--note', 'Rebased.');

  expect(refused.json.error).toStrictEqual({ code: 'bad_args', message: 'give --check once, not 2 times' });
});

test('hq run state refuses to move a run past its merge while a PR is open, and --force moves it', async () => {
  await hq('run', 'add', 'GEO-512', '--session', '512ab0c0-0000-4000-8000-00000000beef', '--title', 'Invented kettle stack', '--where', 'none');
  await hq('run', 'pr', 'GEO-512', 'vers#30');

  const refused = await hq('run', 'state', 'GEO-512', 'deploy-held', '--next', 'Waits on the kettle release.');
  const forced = await hq('run', 'state', 'GEO-512', 'deploy-held', '--next', 'Waits on the kettle release.', '--force');

  expect([refused.code, refused.json.error]).toStrictEqual([
    1,
    { code: 'bad_state', message: 'GEO-512 still has open PR vers#30 and active session 512ab0c0, so its work is not finished: it moves to merged when its last PR merges and its session ends. Pass --force to move it to deploy-held now.' },
  ]);
  expect([forced.code, forced.json.run.state]).toStrictEqual([0, 'deploy-held']);
});

test('hq lanes ready refuses --skipped and --ready-total without --lane', async () => {
  expect((await hq('lanes', 'ready', '--count', '3', '--ready-total', '5')).code).not.toBe(0);
  expect((await hq('lanes', 'ready', '--count', '3', '--skipped', 'GEO-1=x')).code).not.toBe(0);
});

test('hq goals sync holds goals_ok_at while the cap leaves deploy-prod runs unclassified, and sets it once none are left', async () => {
  // A stand-in gh on PATH: no repos, no closed PRs, and an apply that succeeded for every deploy-prod run.
  const path0 = process.env['PATH'];
  const bin = `${dir}/bin`;
  mkdirSync(bin);
  writeFileSync(
    `${bin}/gh`,
    [
      '#!/bin/sh',
      'case "$*" in',
      '  "repo "*) echo "[]" ;;',
      '  *"/jobs?"*) echo \'{"total_count":1,"jobs":[{"name":"apply","conclusion":"success","steps":[]}]}\' ;;',
      '  *) echo \'[{"total_count":0,"incomplete_results":false,"items":[]}]\' ;;',
      'esac',
      '',
    ].join('\n'),
  );
  chmodSync(`${bin}/gh`, 0o755);
  process.env['PATH'] = `${bin}:${path0}`;
  try {
    const d = db();
    const ins = d.query(`INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (?, 'cloud', '.github/workflows/deploy-prod.yml', 'push', 'completed', 'success', 1, ?, ?, ?)`);
    for (let i = 0; i < 61; i++) {
      const t = new Date(Date.now() - 3_600_000 + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'); // inside the --days 2 window
      ins.run(8000 + i, t, t, t);
    }
    d.close();
    const first = await hq('goals', 'sync', '--days', '2');
    expect(first.json.deployLeft).toBe(1);
    expect(getMeta(db(), 'goals_ok_at')).toBeNull();
    const second = await hq('goals', 'sync', '--days', '2');
    expect(second.json.deployLeft).toBe(0);
    expect(getMeta(db(), 'goals_ok_at')).not.toBeNull();
  } finally {
    process.env['PATH'] = path0;
  }
});

test('hq capacity: no sample yet, set and reset a threshold, bad key, an empty log', async () => {
  const empty = await hq('capacity');
  expect(empty.code).toBe(0);
  expect(empty.json.sample).toBeNull();
  expect(empty.json.settings.nonnixMaxMib).toBe(16384);
  expect((await hq('capacity', 'set', 'nonnixMaxMib', '12000')).json.settings.nonnixMaxMib).toBe(12000);
  expect((await hq('capacity', 'set', 'nonnixMaxMib', '--reset')).json.settings.nonnixMaxMib).toBe(16384);
  expect((await hq('capacity', 'set', 'bogus', '1')).code).not.toBe(0);
  expect((await hq('capacity', 'set', 'holdSamples')).code).not.toBe(0);
  expect((await hq('capacity', 'log', '--hours', '6')).json.samples).toEqual([]);
});

test('hq slots broker: none yet, refuses a bad slot and a missing proof, records one, and hq capacity broker reads it', async () => {
  const none = await hq('slots', 'broker');
  const badSlot = await hq('slots', 'broker', '5', '--proof', 'req-1a2b');
  const noProof = await hq('slots', 'broker', '1');
  const blankProof = await hq('slots', 'broker', '1', '--proof', '  ');
  const recorded = await hq('slots', 'broker', '1', '--proof', 'req-1a2b', '--note', 'after the account switch');
  const shown = await hq('slots', 'broker');
  const quota = await hq('capacity', 'broker');

  expect(none.json.broker).toBeNull();
  expect(badSlot.code).not.toBe(0);
  expect(noProof.code).not.toBe(0);
  expect(blankProof.code).not.toBe(0);
  expect(recorded.code).toBe(0);
  expect(recorded.json.broker).toMatchObject({ slot: 1, proof: 'req-1a2b', note: 'after the account switch' });
  expect(shown.json.broker).toStrictEqual(recorded.json.broker);
  expect(quota.json.broker).toMatchObject({ state: 'unknown-proved', slot: 1, proof: 'req-1a2b' });
});

// A v27 database at `file` with a call, a chat and a deleted proposal line typed, which refuses a
// console source; returns its typed rows.
function createV27TypedRows(file: string): unknown[] {
  const v27 = new Database(file, { create: true });
  try {
    migrate(v27, file, false, MIGRATIONS.slice(0, 27));
    v27.exec(`INSERT INTO typed (to_session, to_id, to_name, text, source_kind, source_ref, source_at, typed_by, at) VALUES
      ('z-invented', 'aaaaaaaa-0000-4000-8000-000000000001', 'z-invented', 'Red, please.', 'call', 'kettle-colour', NULL, 'z-stu', '2026-10-15T00:00:00Z'),
      ('z-invented', NULL, NULL, 'Hinge it.', 'proposal', 'teapot-lid', NULL, 'z-stu', '2026-10-15T00:00:00Z'),
      ('z-invented', NULL, NULL, 'Ship it.', 'chat', 'bbbbbbbb-0000-4000-8000-000000000002', '2026-10-14T23:59:00Z', 'z-stu', '2026-10-15T00:00:00Z');
      DELETE FROM typed WHERE id = 2;`);
    expect(() => v27.exec(`INSERT INTO typed (to_session, text, source_kind, source_ref, typed_by, at) VALUES ('z-invented', 'Too early.', 'console', 'kettle-colour', 'z-stu', '2026-10-15T00:00:00Z')`)).toThrow();
    return v27.query('SELECT * FROM typed ORDER BY id').all();
  } finally {
    v27.close();
  }
}

test('hq whois names the fleet session hq fleet saw under an id, and null for any other id', async () => {
  setMeta(db(), 'fleet_ids', JSON.stringify({ 'z-stu': 'id-stu' }));
  const stu = await hq('whois', 'id-stu'),
    teapot = await hq('whois', 'id-teapot');
  expect([stu.json, teapot.json]).toStrictEqual([
    { ok: true, session: 'id-stu', name: 'z-stu' },
    { ok: true, session: 'id-teapot', name: null },
  ]);
});

test('hq band --json gives the segments the band mod draws, by the mod\'s own check', async () => {
  const shown = await hq('band');
  expect([shown.code, (shown.json.band as Band).segments.map((segment) => segment.key), isSegmentList(shown.json.band.segments)]).toStrictEqual([0, ['needs', 'nix', 'lanes', 'ci', 'reviews'], true]);
});

test('hq pane --json gives Markdown and a heat map the pane draws, by the mod\'s own check', async () => {
  const answer = await hq('pane'),
    pane = answer.json.pane as Pane;
  expect([answer.code, pane.markdown.startsWith('## Needs you'), isHeatList(pane.heat)]).toStrictEqual([0, true, true]);
});

test.each([
  ['a capacity.sh reading', `echo '${JSON.stringify({ imp: { freeMib: 4096, room: true }, providers: { claude: { room: true, unattended: true, target: 'imp' } } })}'\n`],
  ['capacity.sh failing', 'echo invented: impd down >&2; exit 1\n'],
])('hq lanes warns, with %s, when the imp lanes, all full, would cross impd\'s non-Nix line', async (_case, script) => {
  mkdirSync(`${dir}/defs/scripts`, { recursive: true });
  writeFileSync(`${dir}/defs/scripts/capacity.sh`, script);
  writeFileSync(`${dir}/defs/pacing.json`, JSON.stringify({ imp: { impMib: 2048 }, lanes: { imp: { kettle: 6, teapot: 3 }, local: { flexible: 1 } } }));
  process.env['HQ_CAPACITY'] = `${dir}/defs/scripts/capacity.sh`;
  out = [];
  const code = await main(['lanes', 'status']);
  delete process.env['HQ_CAPACITY'];

  expect([code, out.join('\n').split('\n').filter((line) => line.startsWith('imp lane plan:'))]).toStrictEqual([0, ["imp lane plan: 9 slot(s), all full, take 18432/16384 MiB and 18/16 vCPUs: over impd's non-Nix line; shrink the imp lanes in pacing.json or raise the line"]]);
});

test('hq run ship prints a vers PR shipped at its merge as at merge', async () => {
  await hq('run', 'add', 'GEO-510', '--title', 'Invented kettle work', '--where', 'none');
  await hq('run', 'pr', 'GEO-510', 'vers#20');
  closePr(db(), 'vers#20', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-20T03:04:05Z', mergeSha: null } });
  await hq('run', 'state', 'GEO-510', 'merged');

  // A stand-in gh on PATH that answers the merge commit; a vers PR needs no other call.
  const path0 = process.env['PATH'];
  const bin = `${dir}/bin`;
  mkdirSync(bin);
  writeFileSync(`${bin}/gh`, ['#!/bin/sh', `echo '{"mergeCommit":{"oid":"${'a'.repeat(40)}"}}'`, ''].join('\n'));
  chmodSync(`${bin}/gh`, 0o755);
  process.env['PATH'] = `${bin}:${path0}`;
  try {
    out = [];

    const code = await main(['run', 'ship']);

    expect(code).toBe(0);
    expect(out.join('\n')).toBe('Moved:\n  GEO-510 -> live-check: vers#20 at merge (2026-10-20T03:04:05Z)\n1 PR(s) newly marked shipped; 0 compare call(s).\n(messages held: HQ_NOTIFY=off)');
  } finally {
    process.env['PATH'] = path0;
  }
});

test('hq run ship lists a run whose helper is still active as left, and moves nothing', async () => {
  await hq('run', 'add', 'GEO-513', '--title', 'Invented kettle work', '--where', 'none');
  await hq('run', 'pr', 'GEO-513', 'vers#22');
  closePr(db(), 'vers#22', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-20T03:04:05Z', mergeSha: null } });
  await hq('run', 'state', 'GEO-513', 'merged');
  await hq('run', 'session', 'GEO-513', '513ab0c0-0000-4000-8000-00000000beef', '--add');

  // A stand-in gh on PATH that answers the merge commit; a vers PR needs no other call.
  const bin = `${dir}/bin`;
  mkdirSync(bin);
  writeFileSync(`${bin}/gh`, ['#!/bin/sh', `echo '{"mergeCommit":{"oid":"${'c'.repeat(40)}"}}'`, ''].join('\n'));
  chmodSync(`${bin}/gh`, 0o755);

  const ran = Bun.spawnSync(['bun', 'src/cli.ts', 'run', 'ship'], { env: { ...process.env, HQ_DB: path, HQ_NOTIFY: 'off', PATH: `${bin}:${process.env['PATH'] ?? ''}` } });

  expect([ran.exitCode, ran.stdout.toString()]).toStrictEqual([0, 'Moved nothing.\n1 PR(s) newly marked shipped; 0 compare call(s).\n  left: GEO-513 has session 513ab0c0 still active\n']);
});

test('hq run ship lists a run put in deploy-held after its release as left held', async () => {
  await hq('run', 'add', 'GEO-511', '--title', 'Invented kettle work', '--where', 'none');
  await hq('run', 'pr', 'GEO-511', 'vers#21');
  closePr(db(), 'vers#21', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-10T03:04:05Z', mergeSha: null } });
  await hq('run', 'state', 'GEO-511', 'deploy-held', '--next', 'Waits on the kettle host to switch.');

  // A stand-in gh on PATH that answers the merge commit; a vers PR needs no other call.
  const path0 = process.env['PATH'];
  const bin = `${dir}/bin`;
  mkdirSync(bin);
  writeFileSync(`${bin}/gh`, ['#!/bin/sh', `echo '{"mergeCommit":{"oid":"${'b'.repeat(40)}"}}'`, ''].join('\n'));
  chmodSync(`${bin}/gh`, 0o755);
  process.env['PATH'] = `${bin}:${path0}`;
  try {
    out = [];

    const code = await main(['run', 'ship']);

    expect(code).toBe(0);
    expect(out.join('\n')).toBe('Moved nothing.\n1 PR(s) newly marked shipped; 0 compare call(s).\n  left held: GEO-511 was put in deploy-held after the release that holds its PRs');
  } finally {
    process.env['PATH'] = path0;
  }
});

test('hq pr override and accept-risk refuse a chat source named by --by and HQ_AS when no session id proves the owner', async () => {
  const saved = process.env['ATC_SESSION_ID'];
  delete process.env['ATC_SESSION_ID'];
  onTestFinished(() => {
    if (saved !== undefined) {
      process.env['ATC_SESSION_ID'] = saved;
    }
  });

  const override = await hq('pr', 'override', 'widgets', '7', '--source', 'chat:kettle-1', '--by', 'z-stu', '--note', 'Teapot is fine.');
  const acceptRisk = await hq('pr', 'accept-risk', 'widgets', '7', 'KET-1-f1', '--source', 'chat:kettle-1', '--by', 'z-stu', '--note', 'Teapot is fine.');

  expect([override.code === 0, override.json.error.code, override.json.error.message.endsWith('; ask z-stu to record it')]).toStrictEqual([false, 'bad_args', true]);
  expect([acceptRisk.code === 0, acceptRisk.json.error.code, acceptRisk.json.error.message.endsWith('; ask z-stu to record it')]).toStrictEqual([false, 'bad_args', true]);
});

interface HistoryEvent {
  action: string;
}

test('hq call answer refuses and saves nothing when atc cannot say whether the caller is the owner session', async () => {
  onTestFinished(overrideEnv('ATC_SESSION_ID', 'id-stu'));
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', `${dir}/no-kettle-here.sock`));
  setMeta(db(), 'fleet_ids', JSON.stringify({ 'z-stu': 'id-stu' }));
  await hq('call', 'add', 'KET-31', '--title', 'Pour widgets#7 now?', '--question', 'Boil?', '--body', 'Invented.');
  await hq('open');

  const answered = await hq('call', 'answer', 'KET-31', '--answer', 'Yes');
  const shown = await hq('call', 'show', 'KET-31', '--history');

  expect([answered.code === 0, answered.json.error.code, answered.json.error.message]).toStrictEqual([
    false,
    'atc_unreachable',
    "atc could not say whether this caller is the owner's session (z-stu), so the answer is not saved: Failed to connect. Run it again once atc answers, or answer in the console",
  ]);
  expect([shown.json.call.state, shown.json.history.map((event: HistoryEvent) => event.action)]).toStrictEqual(['open', ['added', 'opened']]);
});

test("hq call answer ignores a daemon at HQ_ATC_SOCKET that names the owner's session, and saves nothing", async () => {
  const daemon = startStubAtcDaemon(`${dir}/forged-kettle.sock`, {}, { peerSession: 'id-stu' });
  onTestFinished(daemon.stop);
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', daemon.path));
  onTestFinished(overrideEnv('ATC_SESSION_ID', 'id-stu'));
  setMeta(db(), 'fleet_ids', JSON.stringify({ 'z-stu': 'id-stu' }));
  await hq('call', 'add', 'KET-32', '--title', 'Pour widgets#8 now?', '--question', 'Boil?', '--body', 'Invented.');
  await hq('open');

  const answered = await hq('call', 'answer', 'KET-32', '--answer', 'Yes');

  expect([answered.code === 0, answered.json.error.code, daemon.requests]).toStrictEqual([false, 'atc_unreachable', []]);
});

test("hq call answer from a caller hq cannot place as the owner saves the answer with no owner mark", async () => {
  await hq('call', 'add', 'KET-33', '--title', 'Pour widgets#9 now?', '--question', 'Boil?', '--body', 'Invented.');
  await hq('open');

  const answered = await hq('call', 'answer', 'KET-33', '--answer', 'Yes', '--by', 'z-stu');

  expect([answered.code, db().query("SELECT json_extract(data, '$.ownerSession') AS mark FROM events WHERE subject_id = 'KET-33' AND action = 'answered'").all()]).toStrictEqual([0, [{ mark: null }]]);
});

test.each([
  ["the owner's recorded session", 'id-stu', 1],
  ['another session', 'id-kettle', null],
])('hq call answer from a caller atc finds in %s saves the answer with the right owner mark', async (_case, peerSession, mark) => {
  OWNER_PROBE_OPENER.open = () => Promise.resolve({ peerSession, close: () => {} });
  onTestFinished(() => {
    OWNER_PROBE_OPENER.open = null;
  });
  setMeta(db(), 'fleet_ids', JSON.stringify({ 'z-stu': 'id-stu' }));
  await hq('call', 'add', 'KET-34', '--title', 'Pour widgets#10 now?', '--question', 'Boil?', '--body', 'Invented.');
  await hq('open');

  const answered = await hq('call', 'answer', 'KET-34', '--answer', 'Yes');

  expect([answered.code, db().query("SELECT json_extract(data, '$.ownerSession') AS mark FROM events WHERE subject_id = 'KET-34' AND action = 'answered'").all()]).toStrictEqual([0, [{ mark }]]);
});

test('hq console login with no console running says how to start one, and prints no link', async () => {
  const refused = await hq('console', 'login');

  expect(refused.code).toBe(1);
  expect(refused.json.error).toStrictEqual({ code: 'not_running', message: expect.stringContaining('no hq console answers at /nonexistent/hq-test-no-console.sock: start it with hq console in your own terminal') });
});
