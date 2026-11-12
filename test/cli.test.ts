// oxlint-disable zgeoff/test-beside-module -- grandfathered: the whole-program CLI suite
import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { chmodSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { updateEnv } from '@zgeoff/testing/helpers';
import { closePR } from '../src/runs/close-pr.ts';
import { setSession } from '../src/runs/set-session.ts';
import { requirePR } from '../src/runs/require-pr.ts';
import { readEvents } from '../src/read-events.ts';
import { main } from '../src/cli.ts';
import { getMeta } from '../src/db/get-meta.ts';
import { migrate } from '../src/db/migrate.ts';
import { MIGRATIONS } from '../src/db/migrations.ts';
import { openDb } from '../src/db/open-db.ts';
import { setMeta } from '../src/db/set-meta.ts';
import { userVersion } from '../src/db/user-version.ts';
import { startStubAtcDaemon } from './start-stub-atc-daemon.ts';
import { OWNER_PROBE_OPENER } from '../src/pr-status/owner-probe-opener.ts';
import { overrideEnv } from '../src/config/override-env.ts';
import { isHeatList } from '../mods/hq-band/hooks/is-heat-list.ts';
import { isSegmentList } from '../mods/hq-band/hooks/is-segment-list.ts';
import { z } from 'zod';
import { findPath } from '../src/test-utils/find-path.ts';
import { parseJSON } from '../src/noslop/parse-json.ts';
import { NOON_SYDNEY, at, createPushedClone, fakeAtc } from './helpers.ts';
import { buildSeeder } from '../src/test-utils/build-seeder.ts';
import { createTestDb } from './create-test-db.ts';

function setupTest() {
  const fresh = createTestDb();
  at(NOON_SYDNEY);
  updateEnv('HQ_NOTIFY', 'off');
  updateEnv('HQ_AS', 'stu');
  const out: string[] = [];
  const logSpy = spyOn(console, 'log').mockImplementation((line: string) => {
    out.push(line);
  });
  onTestFinished(() => logSpy.mockRestore());
  const errorSpy = spyOn(console, 'error').mockImplementation((line: string) => {
    out.push(line);
  });
  onTestFinished(() => errorSpy.mockRestore());

  return {
    db: fresh.db,
    directory: fresh.dir,
    path: fresh.path,
    out,
    seed: buildSeeder(fresh),
    hq: async (...argv: string[]) => {
      out.length = 0;
      const code = await main([...argv, '--json']);
      const json: unknown = JSON.parse(out.join('\n'));
      return { code, json };
    },
  };
}

test('a call goes queued, open, answered, applied through the CLI', async () => {
  const ctx = setupTest();
  const added = await ctx.hq('call', 'add', 'geo-1-paint', '--title', 'Paint', '--question', 'Green?', '--body', 'Invented.', '--issues', 'GEO-1');
  expect(findPath(added.json, 'result')).toBe('added');
  const opened = await ctx.hq('open');
  expect(findPath(opened.json, 'item', 'id')).toBe('geo-1-paint');
  const status = await ctx.hq('status');
  expect(findPath(status.json, 'open', 'id')).toBe('geo-1-paint');
  const answered = await ctx.hq('call', 'answer', 'geo-1-paint', '--answer', 'yes please');
  expect(findPath(answered.json, 'call', 'answer')).toBe('yes please');
  const applied = await ctx.hq('call', 'apply', 'geo-1-paint', '--to', 'typed:z-delivery');
  expect(findPath(applied.json, 'call', 'state')).toBe('applied');
  const after = await ctx.hq('status');
  expect(findPath(after.json, 'open')).toBeNull();
});

test('the retired hq noslop backfill is refused with bad_args and a nonzero exit', async () => {
  const ctx = setupTest();
  const refused = await ctx.hq('noslop', 'backfill');
  expect(refused.code).not.toBe(0);
  expect(findPath(refused.json, 'error', 'code')).toBe('bad_args');
});

test('errors have one JSON shape and a nonzero exit', async () => {
  const ctx = setupTest();
  await ctx.hq('call', 'add', 'geo-1-paint', '--title', 'Paint', '--question', 'Green?', '--body', 'Invented.');
  await ctx.hq('open');
  await ctx.hq('proposal', 'add', 'tidy', '--title', 'Tidy', '--question', 'Ok?', '--body', 'Invented.');
  const refused = await ctx.hq('proposal', 'open');
  expect(refused.code).toBe(1);
  expect(refused.json).toStrictEqual({ ok: false, error: { code: 'already_open', message: expect.any(String), open: 'geo-1-paint' } });
  const nope = await ctx.hq('call', 'add', '--nope');
  expect(findPath(nope.json, 'error', 'code')).toBe('bad_args');
});

test('status names why the next item waits', async () => {
  const ctx = setupTest();
  await ctx.hq('call', 'add', 'geo-1-paint', '--title', 'Paint', '--question', 'Green?', '--body', 'Invented.');
  await ctx.hq('hold', '--reason', 'the owner is mid-intake');
  const status = await ctx.hq('status');
  expect(findPath(status.json, 'next', 'id')).toBe('geo-1-paint');
  expect(findPath(status.json, 'waits')).toStrictEqual(['held: the owner is mid-intake']);
  await ctx.hq('release');
  const released = await ctx.hq('status');
  expect(findPath(released.json, 'waits')).toStrictEqual([]);
});

test('status counts a watch apart from the open items that need the owner', async () => {
  const ctx = setupTest();
  await ctx.hq('unblock', 'add', '--id', 'descale', '--task', 'Descale the kettle');
  await ctx.hq('unblock', 'add', '--id', 'kettle-release', '--task', 'Live-check the kettle release', '--kind', 'watch', '--done-when', 'release:kettle-co/kettle');

  const status = await ctx.hq('status');

  expect(findPath(status.json, 'unblock')).toStrictEqual({ open: 1, newSincePush: 1, watching: 1 });
});

test('unblock add, list, new, pushed', async () => {
  const ctx = setupTest();
  await ctx.hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle', '--minutes', '5', '--unblocks', 'GEO-2:high');
  const listed = await ctx.hq('unblock', 'list');
  expect(findPath(listed.json, 'items')).toHaveLength(1);
  const fresh = await ctx.hq('unblock', 'new');
  expect(findPath(fresh.json, 'items')).toHaveLength(1);
  const upto = findPath(fresh.json, 'upto');
  const refused = await ctx.hq('unblock', 'pushed');
  expect(findPath(refused.json, 'error', 'code')).toBe('bad_args');
  const pushed = await ctx.hq('unblock', 'pushed', '--upto', String(upto));
  expect(findPath(pushed.json, 'covered')).toBe(1);
  const drained = await ctx.hq('unblock', 'new');
  expect(findPath(drained.json, 'items')).toHaveLength(0);
  await ctx.hq('unblock', 'done', 'kettle');
  const again = await ctx.hq('unblock', 'add', '--id', 'kettle-2', '--task', 'Try the kettle again', '--unblocks', 'GEO-2:high');
  expect(findPath(again.json, 'warnings')).toStrictEqual([expect.objectContaining({ issue: 'GEO-2', id: 'kettle', state: 'done' })]);
});

test('it stores each --done-when condition of hq unblock add', async () => {
  const ctx = setupTest();
  const added = await ctx.hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle', '--done-when', 'issue:ket-7', '--done-when', 'pr:kettle#4');

  expect(findPath(added.json, 'item', 'done_when')).toStrictEqual([
    { kind: 'issue', ref: 'KET-7' },
    { kind: 'pr', ref: 'zgeoff/kettle#4' },
  ]);
});

test('it lists the conditions of an item in hq unblock list --json', async () => {
  const ctx = setupTest();
  await ctx.hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle', '--done-when', 'issue:ket-7', '--done-when', 'pr:kettle#4');

  const listed = await ctx.hq('unblock', 'list');

  expect(findPath(listed.json, 'items', 0, 'done_when')).toStrictEqual([
    { kind: 'issue', ref: 'KET-7' },
    { kind: 'pr', ref: 'zgeoff/kettle#4' },
  ]);
});

test('it prints the conditions of an item in hq unblock show', async () => {
  const ctx = setupTest();
  await ctx.hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle', '--done-when', 'issue:ket-7', '--done-when', 'pr:kettle#4');
  ctx.out.length = 0;

  await main(['unblock', 'show', 'kettle']);

  expect(ctx.out).toStrictEqual(['Try the kettle · done when issue:KET-7, pr:zgeoff/kettle#4 · added 2026-10-14T01:00:00Z · id kettle']);
});

test('it refuses a bad --done-when of hq unblock add as bad_args and adds nothing', async () => {
  const ctx = setupTest();
  const added = await ctx.hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle', '--done-when', 'foo:1');
  const listed = await ctx.hq('unblock', 'list');

  expect(findPath(added.json, 'error', 'code')).toBe('bad_args');
  expect(findPath(listed.json, 'items')).toStrictEqual([]);
});

test('it adds conditions to an open item with hq unblock done-when', async () => {
  const ctx = setupTest();
  await ctx.hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle');

  const added = await ctx.hq('unblock', 'done-when', 'kettle', 'doc:descaling-plan-abc123def456', 'issue:KET-7');

  expect(findPath(added.json, 'item', 'done_when')).toStrictEqual([
    { kind: 'doc', ref: 'descaling-plan-abc123def456' },
    { kind: 'issue', ref: 'KET-7' },
  ]);
});

test('it refuses hq unblock done-when with no condition as bad_args', async () => {
  const ctx = setupTest();
  await ctx.hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle');

  const none = await ctx.hq('unblock', 'done-when', 'kettle');

  expect(findPath(none.json, 'error', 'code')).toBe('bad_args');
});

test('it refuses hq unblock done-when on a closed item as bad_state', async () => {
  const ctx = setupTest();
  await ctx.hq('unblock', 'add', '--id', 'kettle', '--task', 'Try the kettle');
  await ctx.hq('unblock', 'done', 'kettle');

  const closed = await ctx.hq('unblock', 'done-when', 'kettle', 'issue:KET-8');

  expect(findPath(closed.json, 'error', 'code')).toBe('bad_state');
});

test('it marks an item with no condition as recheck in hq unblock list after 3 days', async () => {
  const ctx = setupTest();
  await ctx.hq('unblock', 'add', '--id', 'plain', '--task', 'Try the kettle');
  at('2026-10-17T02:00:00Z');

  const listed = await ctx.hq('unblock', 'list');

  expect(findPath(listed.json, 'items')).toStrictEqual([
    {
      id: 'plain',
      task: 'Try the kettle',
      minutes: null,
      unblocks: [],
      rank: null,
      notify: [],
      added_by: 'stu',
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
  const ctx = setupTest();
  await ctx.hq('unblock', 'add', '--id', 'plain', '--task', 'Try the kettle');
  at('2026-10-16T01:00:00Z');

  const listed = await ctx.hq('unblock', 'list');

  expect(findPath(listed.json, 'items')).toStrictEqual([
    {
      id: 'plain',
      task: 'Try the kettle',
      minutes: null,
      unblocks: [],
      rank: null,
      notify: [],
      added_by: 'stu',
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
  const ctx = setupTest();
  await ctx.hq('unblock', 'add', '--id', 'waiting', '--task', 'Try the teapot', '--done-when', 'issue:KET-7');
  at('2026-10-17T02:00:00Z');

  const listed = await ctx.hq('unblock', 'list');

  expect(findPath(listed.json, 'items')).toStrictEqual([
    {
      id: 'waiting',
      task: 'Try the teapot',
      minutes: null,
      unblocks: [],
      rank: null,
      notify: [],
      added_by: 'stu',
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
  const ctx = setupTest();
  await ctx.hq('unblock', 'add', '--id', 'plain', '--task', 'Try the kettle');
  at('2026-10-17T02:00:00Z');
  ctx.out.length = 0;

  await main(['unblock', 'list']);

  expect(ctx.out).toStrictEqual(['Try the kettle · added 2026-10-14T01:00:00Z · id plain · recheck']);
});

test('a schema upgrade backs up the live database first', () => {
  const ctx = setupTest();
  const db = openDb(ctx.path);
  setMeta(db, 'marker', 'kept');
  const backup = migrate(db, ctx.path, true, [...MIGRATIONS, 'CREATE TABLE gadgets (name TEXT)']);
  db.close();
  expect(backup).toMatch(new RegExp(`hq\\.db\\.bak-v${MIGRATIONS.length}-`));
  const copy = new Database(backup!, { readonly: true });
  expect(userVersion(copy)).toBe(MIGRATIONS.length);
  expect(copy.query(`SELECT value FROM meta WHERE key='marker'`).get()).toEqual({ value: 'kept' });
  copy.close();
});

test('an older hq refuses a newer database', () => {
  const ctx = setupTest();
  const db = openDb(ctx.path);
  db.exec('PRAGMA user_version = 99');
  db.close();
  expect(() => openDb(ctx.path)).toThrow('install a newer hq');
});

test('migrating from v1 backs up first and runs each later step', () => {
  const ctx = setupTest();
  const v1File = `${ctx.directory}/v1.db`;
  const v1 = new Database(v1File, { create: true });
  migrate(v1, v1File, false, MIGRATIONS.slice(0, 1));
  v1.close();
  const db = openDb(v1File);
  expect(userVersion(db)).toBe(MIGRATIONS.length);
  db.close();
  expect(readdirSync(ctx.directory).some((name) => name.startsWith('v1.db.bak-v1-'))).toBe(true);
});

test('v15 rebuilds news with every row, its read state and its id sequence, and takes report', () => {
  const ctx = setupTest();
  const file = `${ctx.directory}/v14.db`;
  const v14 = new Database(file, { create: true });
  migrate(v14, file, false, MIGRATIONS.slice(0, 14));

  // An old schema that no current owner can write: this migration test builds it by hand.
  const add = v14.query(`INSERT INTO news (from_name, topic, text, added_at, read_at, needs_geoff) VALUES ('z-invented', ?, ?, '2026-10-15T00:00:00Z', ?, ?)`);
  add.run('merge', 'an invented merge', null, 1);
  add.run('other', 'an invented note', '2026-10-15T01:00:00Z', 0);
  add.run('fix', 'deleted later', null, 0);
  v14.exec(`DELETE FROM news WHERE id = 3`);
  expect(() => add.run('report', 'too early', null, 0)).toThrow();
  v14.close();
  const db = openDb(file);
  expect(db.query('SELECT id, topic, text, read_at, needs_geoff FROM news ORDER BY id').all()).toEqual([
    { id: 1, topic: 'merge', text: 'an invented merge', read_at: null, needs_geoff: 1 },
    { id: 2, topic: 'other', text: 'an invented note', read_at: '2026-10-15T01:00:00Z', needs_geoff: 0 },
  ]);
  db.query(`INSERT INTO news (from_name, topic, text, added_at) VALUES ('z-invented', 'report', 'an invented report', '2026-10-16T00:00:00Z')`).run();
  expect(db.query(`SELECT id FROM news WHERE topic = 'report'`).get()).toStrictEqual({ id: 4 });
  expect(db.query(`SELECT name FROM sqlite_master WHERE name LIKE 'news%' ORDER BY name`).all()).toEqual([{ name: 'news' }, { name: 'news_unread' }]);
  expect(() => db.query(`INSERT INTO news (from_name, topic, text, added_at) VALUES ('z', 'gossip', 't', 't')`).run()).toThrow();
  db.close();
});

test('hq probe status shows the last ready check and the unready episodes', async () => {
  const ctx = setupTest();
  ctx.seed.probeSample({ at: '2026-10-14T00:59:00Z', readyOk: false });
  ctx.seed.downProbeSample({ at: '2026-10-14T01:00:00Z' });
  ctx.seed.unreadyOutage({ startedAt: '2026-10-14T00:55:00Z', detectedAt: '2026-10-14T00:59:00Z' });
  const probe = await ctx.hq('probe', 'status');
  expect(findPath(probe.json, 'openUnready')).toMatchObject({ kind: 'unready', started_at: '2026-10-14T00:55:00Z' });
  expect(findPath(probe.json, 'open')).toBeNull();
  expect(findPath(probe.json, 'outages')).toStrictEqual([]);
  expect(findPath(probe.json, 'unready')).toHaveLength(1);
  expect(findPath(probe.json, 'lastReady')).toStrictEqual({ at: '2026-10-14T00:59:00Z', ready_ok: 0 });
  expect(findPath(probe.json, 'last')).toMatchObject({ at: '2026-10-14T01:00:00Z', ready_ok: null });
  ctx.out.length = 0;
  await main(['probe', 'status']);
  const text = ctx.out.join('\n');
  expect(text).toContain('last ready check: 2026-10-14T00:59:00Z (NOT ready)');
  expect(text).toContain('OPEN unready since 2026-10-14T00:55:00Z');
  expect(text).toContain('no open outage');
  expect(text).toContain('1 unready episode(s)');
});

test('hq goals target and targets, the daily dry run, and news --tag work through the CLI', async () => {
  const ctx = setupTest();
  const targets = await ctx.hq('goals', 'targets');
  expect(findPath(targets.json, 'overridden')).toStrictEqual([]);
  const bugs = await ctx.hq('goals', 'target', 'bugs', '<=', '15');
  expect(findPath(bugs.json, 'target')).toMatchObject({ op: '<=', value: 15 });
  const overridden = await ctx.hq('goals', 'targets');
  expect(findPath(overridden.json, 'overridden')).toStrictEqual(['bugs']);
  const cleared = await ctx.hq('goals', 'target', 'cost', 'none');
  expect(findPath(cleared.json, 'target')).toBeNull();
  const bad = await ctx.hq('goals', 'target', 'moon', '<', '5');
  expect(bad.code).not.toBe(0);
  expect(findPath(bad.json, 'error', 'code')).toBe('bad_args');
  const dry = await ctx.hq('goals', 'daily', '--dry-run');
  expect(findPath(dry.json, 'dryRun')).toBe(true);
  expect(findPath(dry.json, 'text')).toContain('Goals check-in, Wed 14 Oct:');
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM job_runs').get()).toStrictEqual({ count: 0 });
  const skipped =await ctx.hq('goals', 'daily', 'skip', '2026-10-14', '--reason', 'by hand');
  expect(skipped.code).toBe(0);
  const tagged = await ctx.hq('news', 'add', '--topic', 'fix', '--text', 'Invented flag.', '--tag', 'weekly-flag');
  expect(findPath(tagged.json, 'news', 'tag')).toBe('weekly-flag');
  const badTag = await ctx.hq('news', 'add', '--topic', 'fix', '--text', 'Invented flag.', '--tag', 'Bad Tag');
  expect(badTag.code).not.toBe(0);
  const news = await ctx.hq('news');
  expect(findPath(news.json, 'news', 0, 'tag')).toBe('weekly-flag');
});

test('hq goals weekly dry run and skip, and hq goals account, work through the CLI', async () => {
  const ctx = setupTest();
  const dry = await ctx.hq('goals', 'weekly', '--dry-run');
  expect(findPath(dry.json, 'dryRun')).toBe(true);
  expect(findPath(dry.json, 'text')).toContain('Goals weekly, week of 05 Oct:');
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM job_runs').get()).toStrictEqual({ count: 0 });
  expect(ctx.db.query('SELECT COUNT(*) AS count FROM outbox').get()).toStrictEqual({ count: 0 });
  const skippedMonday = await ctx.hq('goals', 'weekly', 'skip', '2026-10-12', '--reason', 'by hand');
  expect(skippedMonday.code).toBe(0);
  const skipped = await ctx.hq('goals', 'weekly', 'skip', '2026-10-14', '--reason', 'by hand');
  expect(findPath(skipped.json, 'error', 'code')).toBe('bad_args');
  const unlabelled = await ctx.hq('goals', 'account');
  expect(findPath(unlabelled.json, 'labels')).toStrictEqual({});
  const named = await ctx.hq('goals', 'account', 'abcdef012345', 'work');
  expect(findPath(named.json, 'name')).toBe('work');
  const labelled = await ctx.hq('goals', 'account');
  expect(findPath(labelled.json, 'labels')).toStrictEqual({ abcdef012345: 'work' });
  const refused = await ctx.hq('goals', 'account', 'geoff@example.com', 'work');
  expect(findPath(refused.json, 'error', 'code')).toBe('bad_args');
});

test('--version and version both answer', async () => {
  const ctx = setupTest();
  const shown = await ctx.hq('--version');
  expect(findPath(shown.json, 'version')).toMatch(/^\d+\.\d+\.\d+$/u);
  const version = await ctx.hq('version');
  expect(version.code).toBe(0);
});

test('a run from source names no commit, whatever its environment holds', () => {
  setupTest();
  const ran = Bun.spawnSync(['bun', 'src/cli.ts', 'version', '--json'], { env: { ...process.env, INSTALL_COMMIT: 'f'.repeat(40), INSTALL_DIRTY: 'false', HQ_BUILD: '{"commit":"x","dirty":false}' } });
  expect(JSON.parse(ran.stdout.toString())).toMatchObject({ commit: null, dirty: null });
});

test('version names no commit for a run from source', async () => {
  const ctx = setupTest();
  const result = await ctx.hq('version');
  expect(result.json).toMatchObject({ commit: null, dirty: null });
});

test('release without a hold changes nothing', async () => {
  const ctx = setupTest();
  const idle = await ctx.hq('release');
  expect(findPath(idle.json, 'released')).toBe(false);
  await ctx.hq('hold', '--reason', 'busy');
  const held = await ctx.hq('release');
  expect(findPath(held.json, 'released')).toBe(true);
});

test('status lists every later item', async () => {
  const ctx = setupTest();
  for (const id of ['a-one', 'b-two']) {
    await ctx.hq('call', 'add', id, '--title', 'T', '--question', `${id}?`, '--body', 'Invented.');
    await ctx.hq('call', 'later', id, '--until', '+4h');
  }
  const status = await ctx.hq('status');
  const later = z.array(z.looseObject({ id: z.string() })).parse(findPath(status.json, 'later'));
  expect(later.map((item) => item.id)).toStrictEqual(['a-one', 'b-two']);
});

test('hq run reopen brings a dropped run back to working, as the refusal says', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-508', '--title', 'Invented kettle work', '--where', 'none');
  await ctx.hq('run', 'pr', 'GEO-508', 'kettle#9');
  await ctx.hq('run', 'state', 'GEO-508', 'dropped', '--note', 'paused');
  const refused = await ctx.hq('run', 'add', 'GEO-508', '--title', 'Invented kettle work');
  expect(findPath(refused.json, 'error', 'message')).toBe('GEO-508 is dropped: hq run reopen GEO-508');
  const reopened = await ctx.hq('run', 'reopen', 'GEO-508', '--next', 'Back on it.');
  expect(findPath(reopened.json, 'run')).toMatchObject({ issue: 'GEO-508', state: 'working', next: 'Back on it.', closed_at: null });
  const prs = z.array(z.looseObject({ ref: z.string() })).parse(findPath(reopened.json, 'run', 'prs'));
  expect(prs.map((pr) => pr.ref)).toStrictEqual(['kettle#9']);
  const attached = await ctx.hq('run', 'pr', 'GEO-508', 'kettle#10');
  expect(attached.code).toBe(0);
  const working = await ctx.hq('run', 'reopen', 'GEO-508');
  expect(findPath(working.json, 'error', 'message')).toBe('GEO-508 is working, not done or dropped: nothing to reopen');
  const missing = await ctx.hq('run', 'reopen', 'GEO-404');
  expect(missing.code).not.toBe(0);
});

test('it attaches with hq run pr --session the PR and sets its owner, and works again on the attached PR', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-531', '--title', 'Invented kettle work', '--where', 'none');
  setSession(ctx.db, 'GEO-531', '0000e101-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'stu', 'add');
  setSession(ctx.db, 'GEO-531', '0000e102-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'stu', 'add');

  const first = await ctx.hq('run', 'pr', 'GEO-531', 'kettle#31', '--session', '0000E101');
  const again = await ctx.hq('run', 'pr', 'GEO-531', 'kettle#31', '--session', '0000e102');

  expect([first.code, findPath(first.json, 'pr', 'session_id')]).toStrictEqual([0, '0000e101-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
  expect([again.code, findPath(again.json, 'pr', 'session_id')]).toStrictEqual([0, '0000e102-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
});

test('it refuses hq run pr --session a session that is not on the run, naming the issue', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-532', '--title', 'Invented kettle work', '--where', 'none');

  const refused = await ctx.hq('run', 'pr', 'GEO-532', 'kettle#32', '--session', '0000e1ff');

  expect([refused.code === 0, findPath(refused.json, 'error', 'code'), findPath(refused.json, 'error', 'message')]).toStrictEqual([false, 'bad_args', '--session 0000e1ff names no single session of GEO-532']);
  expect(ctx.db.query("SELECT COUNT(*) AS count FROM run_prs WHERE ref = 'kettle#32'").get()).toStrictEqual({ count: 0 });
});

test('it succeeds and changes nothing when hq run merged names a PR already marked merged', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-509', '--title', 'Invented kettle work', '--where', 'none');
  await ctx.hq('run', 'pr', 'GEO-509', 'kettle#11');
  closePR(ctx.db, 'kettle#11', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-20T03:04:05Z', mergeSha: null } });
  const before = ctx.db.query("SELECT * FROM run_prs WHERE ref = 'kettle#11'").get();

  const again = await ctx.hq('run', 'merged', 'kettle#11');

  expect(again.code).toBe(0);
  expect(findPath(again.json, 'pr')).toMatchObject({ ref: 'kettle#11', state: 'merged', merged_at: '2026-10-20T03:04:05Z' });
  expect(ctx.db.query("SELECT * FROM run_prs WHERE ref = 'kettle#11'").get()).toStrictEqual(before);
});

test('it still refuses hq run merged for a PR marked closed', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-509', '--title', 'Invented kettle work', '--where', 'none');
  await ctx.hq('run', 'pr', 'GEO-509', 'kettle#12');
  closePR(ctx.db, 'kettle#12', { to: 'closed', actor: 'hq-github' });

  const bin = `${ctx.directory}/bin`;
  mkdirSync(bin);
  writeFileSync(`${bin}/gh`, ['#!/bin/sh', 'echo \'{"state":"MERGED"}\'', ''].join('\n'));
  chmodSync(`${bin}/gh`, 0o755);
  updateEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`);

  const again = await ctx.hq('run', 'merged', 'kettle#12');

  expect(again.code).not.toBe(0);
  expect(findPath(again.json, 'error')).toMatchObject({ code: 'bad_state', message: 'kettle#12 is closed' });
  expect(ctx.db.query("SELECT state FROM run_prs WHERE ref = 'kettle#12'").get()).toStrictEqual({ state: 'closed' });
});

test('hq run add refuses a session id given as a second word, and stores the run only with --session', async () => {
  const ctx = setupTest();
  const refused = await ctx.hq('run', 'add', 'GEO-9701', '9701ab0c-0000-4000-8000-00000000beef', '--title', 'Invented kettle work', '--where', 'none');
  const remaining = await ctx.hq('run', 'list');
  const stored = await ctx.hq('run', 'add', 'GEO-9701', '--session', '9701ab0c-0000-4000-8000-00000000beef', '--title', 'Invented kettle work', '--where', 'none');
  expect([refused.code, findPath(refused.json, 'error', 'message')]).toStrictEqual([1, 'hq run add takes one issue: pass the session as --session 9701ab0c-0000-4000-8000-00000000beef']);
  expect(findPath(remaining.json, 'runs')).toStrictEqual([]);
  const sessionSchema = z.object({ session_id: z.string() });
  const run = z.object({ run: z.object({ sessions: z.array(sessionSchema) }) }).parse(stored.json);

  expect(run.run.sessions.map((session) => session.session_id)).toStrictEqual(['9701ab0c-0000-4000-8000-00000000beef']);
});

test('#run add names hq run session --add for a --session it ignores on a run already on the board', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-9702', '--session', '9702ab0c-0000-4000-8000-00000000aaaa', '--title', 'Invented kettle work', '--where', 'none');
  const helper = await ctx.hq('run', 'add', 'GEO-9702', '--session', '9702ab0c-0000-4000-8000-00000000bbbb', '--title', 'Invented kettle work', '--where', 'none');
  const same = await ctx.hq('run', 'add', 'GEO-9702', '--session', '9702ab0c-0000-4000-8000-00000000aaaa', '--title', 'Invented kettle work', '--where', 'none');
  expect(helper.code).toBe(0);
  expect(helper.json).toMatchObject({
    result: 'noop',
    ignored: { session: '9702ab0c-0000-4000-8000-00000000bbbb', next: 'hq run session GEO-9702 9702ab0c-0000-4000-8000-00000000bbbb --add' },
    run: { sessions: [{ session_id: '9702ab0c-0000-4000-8000-00000000aaaa' }] },
  });
  expect(findPath(same.json, 'result')).toBe('noop');
  expect(findPath(same.json, 'ignored')).toBeUndefined();
});

test('#run add prints the hq run session --add line in text output only for a session it ignores', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-9703', '--session', '9703ab0c-0000-4000-8000-00000000aaaa', '--title', 'Invented kettle work', '--where', 'none');
  ctx.out.length = 0;
  await main(['run', 'add', 'GEO-9703', '--session', '9703ab0c-0000-4000-8000-00000000bbbb', '--title', 'Invented kettle work', '--where', 'none']);
  const ignoredText = ctx.out.join('\n');
  ctx.out.length = 0;
  await main(['run', 'add', 'GEO-9703', '--session', '9703ab0c-0000-4000-8000-00000000aaaa', '--title', 'Invented kettle work', '--where', 'none']);
  const sameText = ctx.out.join('\n');
  expect(ignoredText).toContain('Already on the board.\nIgnored --session 9703ab0c-0000-4000-8000-00000000bbbb: the session is not attached to the run. To add it, use hq run session GEO-9703 9703ab0c-0000-4000-8000-00000000bbbb --add');
  expect(sameText).toContain('Already on the board.');
  expect(sameText).not.toContain('Ignored --session');
});

test('#run add prints both lanes and hq run lane for a different --lane it ignores on a run already on the board', async () => {
  const ctx = setupTest();
  mkdirSync(`${ctx.directory}/defs/scripts`, { recursive: true });
  writeFileSync(`${ctx.directory}/defs/pacing.json`, JSON.stringify({ lanes: { imp: { kettle: 2, teapot: 1 } } }));
  updateEnv('HQ_CAPACITY', `${ctx.directory}/defs/scripts/capacity.sh`);
  await ctx.hq('run', 'add', 'GEO-9704', '--lane', 'kettle', '--title', 'Invented kettle work', '--where', 'imp');
  ctx.out.length = 0;

  const code = await main(['run', 'add', 'GEO-9704', '--lane', 'teapot', '--title', 'Invented kettle work', '--where', 'imp']);

  expect([code, ctx.out.join('\n').split('\n').slice(-2)]).toStrictEqual([0, ['Already on the board.', "Ignored --lane teapot: one issue has one run, and GEO-9704's run is in lane kettle. To move it, use hq run lane GEO-9704 teapot"]]);
});

test('#run add gives both lanes in JSON for a different --lane it ignores on a run already on the board', async () => {
  const ctx = setupTest();
  mkdirSync(`${ctx.directory}/defs/scripts`, { recursive: true });
  writeFileSync(`${ctx.directory}/defs/pacing.json`, JSON.stringify({ lanes: { imp: { kettle: 2, teapot: 1 } } }));
  updateEnv('HQ_CAPACITY', `${ctx.directory}/defs/scripts/capacity.sh`);
  await ctx.hq('run', 'add', 'GEO-9705', '--lane', 'kettle', '--title', 'Invented kettle work', '--where', 'imp');

  const again = await ctx.hq('run', 'add', 'GEO-9705', '--lane', 'teapot', '--title', 'Invented kettle work', '--where', 'imp');

  expect([again.code, findPath(again.json, 'result'), findPath(again.json, 'ignoredLane'), findPath(again.json, 'run', 'lane')]).toStrictEqual([0, 'noop', { lane: 'teapot', runLane: 'kettle', next: 'hq run lane GEO-9705 teapot' }, 'kettle']);
});

test.each([
  ['no --lane', []],
  ['the same --lane', ['--lane', 'kettle']],
])('#run add prints only "Already on the board." on a run already on the board given %s and no --session', async (_case, laneFlags) => {
  const ctx = setupTest();
  mkdirSync(`${ctx.directory}/defs/scripts`, { recursive: true });
  writeFileSync(`${ctx.directory}/defs/pacing.json`, JSON.stringify({ lanes: { imp: { kettle: 2, teapot: 1 } } }));
  updateEnv('HQ_CAPACITY', `${ctx.directory}/defs/scripts/capacity.sh`);
  await ctx.hq('run', 'add', 'GEO-9706', '--lane', 'kettle', '--title', 'Invented kettle work', '--where', 'imp');
  ctx.out.length = 0;

  const code = await main(['run', 'add', 'GEO-9706', ...laneFlags, '--title', 'Invented kettle work', '--where', 'imp']);

  expect([code, ctx.out.join('\n').split('\n').slice(1)]).toStrictEqual([0, ['Already on the board.']]);
});

test('v20 adds live_check to runs and the merge and release columns to run_prs', () => {
  const ctx = setupTest();
  const file = `${ctx.directory}/v19.db`;
  const v19 = new Database(file, { create: true });
  migrate(v19, file, false, MIGRATIONS.slice(0, 19));

  // An old schema that no current owner can write: this migration test builds it by hand.
  v19.query(`INSERT INTO runs (issue, title, place, state, next, created_at, updated_at) VALUES ('GEO-1', 'Invented kettle work', 'none', 'merged', 'x', '2026-10-16T00:00:00Z', '2026-10-16T00:00:00Z')`).run();
  v19.query(`INSERT INTO run_prs (ref, issue, state, added_at, updated_at) VALUES ('nixie#1', 'GEO-1', 'merged', '2026-10-16T00:00:00Z', '2026-10-16T00:00:00Z')`).run();
  v19.close();
  const db = openDb(file);
  expect(db.query('SELECT live_check FROM runs').all()).toEqual([{ live_check: null }]);
  expect(db.query('SELECT merge_sha, shipped_tag, shipped_at FROM run_prs').all()).toEqual([{ merge_sha: null, shipped_tag: null, shipped_at: null }]);
  db.query(`UPDATE runs SET live_check = 'none'`).run();
  expect(() => db.query(`UPDATE runs SET live_check = 'maybe'`).run()).toThrow();
  expect(userVersion(db)).toBe(MIGRATIONS.length);
  expect(MIGRATIONS.length).toBeGreaterThanOrEqual(20);
  db.close();
});

test('hq run check and state --check set live_check, and show it', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-509', '--title', 'Invented kettle work', '--where', 'none');
  const none = await ctx.hq('run', 'check', 'GEO-509', 'none');
  expect(findPath(none.json, 'run', 'live_check')).toBe('none');
  const deploying = await ctx.hq('run', 'state', 'GEO-509', 'deploying', '--check', 'owed');
  expect(findPath(deploying.json, 'run')).toMatchObject({ state: 'deploying', live_check: 'owed' });
  const shown = await ctx.hq('run', 'show', 'GEO-509');
  expect(findPath(shown.json, 'run', 'live_check')).toBe('owed');
  const badCheck = await ctx.hq('run', 'check', 'GEO-509', 'maybe');
  expect(badCheck.code).not.toBe(0);
  const badStateCheck = await ctx.hq('run', 'state', 'GEO-509', 'deploying', '--check', 'maybe');
  expect(badStateCheck.code).not.toBe(0);
});

test('hq run state refuses --check given twice, and leaves the run as it was', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-510', '--title', 'Invented kettle work', '--where', 'none');

  const refused = await ctx.hq('run', 'state', 'GEO-510', 'deploying', '--check', 'owed', '--check', 'none');
  const shown = await ctx.hq('run', 'show', 'GEO-510');

  expect(findPath(refused.json, 'error')).toStrictEqual({ code: 'bad_args', message: 'give --check once, not 2 times' });
  expect(findPath(shown.json, 'run', 'state')).toBe('working');
});

test('it refuses a --check other than owed or none on hq run state, and leaves the run as it was', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-14', '--title', 'Invented kettle work', '--where', 'none');

  const refused = await ctx.hq('run', 'state', 'GEO-14', 'deploying', '--check', 'maybe');
  const shown = await ctx.hq('run', 'show', 'GEO-14');

  const shownRun = z.object({ run: z.object({ state: z.string() }) }).parse(shown.json).run;

  expect(refused).toStrictEqual({ code: 1, json: { ok: false, error: { code: 'bad_args', message: '--check must be owed or none' } } });
  expect(shownRun.state).toBe('working');
});

test('hq pr override refuses --check given twice', async () => {
  const ctx = setupTest();
  const refused = await ctx.hq('pr', 'override', 'widgets', '7', '--check', 'preview', '--check', 'test', '--source', 'chat:kettle-12', '--note', 'Rebased.');

  expect(findPath(refused.json, 'error')).toStrictEqual({ code: 'bad_args', message: 'give --check once, not 2 times' });
});

test('hq run state refuses to move a run past its merge while a PR is open, and --force moves it', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-512', '--session', '512ab0c0-0000-4000-8000-00000000beef', '--title', 'Invented kettle stack', '--where', 'none');
  await ctx.hq('run', 'pr', 'GEO-512', 'vers#30');

  const refused = await ctx.hq('run', 'state', 'GEO-512', 'deploy-held', '--next', 'Waits on the kettle release.');
  const forced = await ctx.hq('run', 'state', 'GEO-512', 'deploy-held', '--next', 'Waits on the kettle release.', '--force');

  expect([refused.code, findPath(refused.json, 'error')]).toStrictEqual([
    1,
    { code: 'bad_state', message: 'GEO-512 still has open PR vers#30 and active session 512ab0c0, so its work is not finished: it moves to merged when its last PR merges and its session ends. Pass --force to move it to deploy-held now.' },
  ]);
  expect([forced.code, findPath(forced.json, 'run', 'state')]).toStrictEqual([0, 'deploy-held']);
});

test('hq lanes ready refuses --skipped and --ready-total without --lane', async () => {
  const ctx = setupTest();
  const withTotal = await ctx.hq('lanes', 'ready', '--count', '3', '--ready-total', '5');
  const withSkipped = await ctx.hq('lanes', 'ready', '--count', '3', '--skipped', 'GEO-1=x');
  expect(withTotal.code).not.toBe(0);
  expect(withSkipped.code).not.toBe(0);
});

test('hq goals sync holds goals_ok_at while the cap leaves deploy-prod runs unclassified, and sets it once none are left', async () => {
  const ctx = setupTest();
  const bin = `${ctx.directory}/bin`;
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
  updateEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`);
  for (let index = 0; index < 61; index++) {
    const stamp = new Date(Date.now() - 3_600_000 + index * 1000).toISOString().replace(/\.\d{3}Z$/u, 'Z');
    ctx.seed.ciRun({ id: 8000 + index, repo: 'cloud', path: '.github/workflows/deploy-prod.yml', created_at: stamp, started_at: stamp, updated_at: stamp });
  }

  const first = await ctx.hq('goals', 'sync', '--days', '2');
  expect(findPath(first.json, 'deployLeft')).toBe(1);
  expect(getMeta(ctx.db, 'goals_ok_at')).toBeNull();
  const second = await ctx.hq('goals', 'sync', '--days', '2');
  expect(findPath(second.json, 'deployLeft')).toBe(0);
  expect(getMeta(ctx.db, 'goals_ok_at')).not.toBeNull();
});

test('hq capacity: no sample yet, set and reset a threshold, bad key, an empty log', async () => {
  const ctx = setupTest();
  const empty = await ctx.hq('capacity');
  expect(empty.code).toBe(0);
  expect(findPath(empty.json, 'sample')).toBeNull();
  expect(findPath(empty.json, 'settings', 'nonnixMaxMib')).toBe(16_384);
  const raised = await ctx.hq('capacity', 'set', 'nonnixMaxMib', '12000');
  expect(findPath(raised.json, 'settings', 'nonnixMaxMib')).toBe(12_000);
  const reset = await ctx.hq('capacity', 'set', 'nonnixMaxMib', '--reset');
  expect(findPath(reset.json, 'settings', 'nonnixMaxMib')).toBe(16_384);
  const bogus = await ctx.hq('capacity', 'set', 'bogus', '1');
  expect(bogus.code).not.toBe(0);
  const noValue = await ctx.hq('capacity', 'set', 'holdSamples');
  expect(noValue.code).not.toBe(0);
  const log = await ctx.hq('capacity', 'log', '--hours', '6');
  expect(findPath(log.json, 'samples')).toStrictEqual([]);
});

test('hq slots broker shows no record before one is recorded', async () => {
  const ctx = setupTest();
  const shown = await ctx.hq('slots', 'broker');

  expect(findPath(shown.json, 'broker')).toBeNull();
});

test('hq slots broker refuses a slot outside 1 to 4', async () => {
  const ctx = setupTest();
  const refused = await ctx.hq('slots', 'broker', '5', '--proof', 'req-1a2b');

  expect(refused.code).not.toBe(0);
});

test('hq slots broker refuses a slot with no --proof', async () => {
  const ctx = setupTest();
  const refused = await ctx.hq('slots', 'broker', '1');

  expect(refused.code).not.toBe(0);
});

test('hq slots broker refuses a blank --proof', async () => {
  const ctx = setupTest();
  const refused = await ctx.hq('slots', 'broker', '1', '--proof', '  ');

  expect(refused.code).not.toBe(0);
});

test('hq slots broker records a slot with its proof and note, and shows it after', async () => {
  const ctx = setupTest();
  const recorded = await ctx.hq('slots', 'broker', '1', '--proof', 'req-1a2b', '--note', 'after the account switch');
  const shown = await ctx.hq('slots', 'broker');

  expect(recorded.code).toBe(0);
  expect(findPath(recorded.json, 'broker')).toMatchObject({ slot: 1, proof: 'req-1a2b', note: 'after the account switch' });
  expect(findPath(shown.json, 'broker')).toStrictEqual(findPath(recorded.json, 'broker'));
});

test('hq capacity broker gives an unknown quota with room for a new proof and no slot read', async () => {
  const ctx = setupTest();
  await ctx.hq('slots', 'broker', '1', '--proof', 'req-1a2b');

  const quota = await ctx.hq('capacity', 'broker');

  expect(findPath(quota.json, 'broker')).toMatchObject({ state: 'unknown-proved', slot: 1, proof: 'req-1a2b' });
});

test("hq capacity broker reads the broker slot's fresh slot read from the database, not another slot's", async () => {
  const ctx = setupTest();
  ctx.seed.slotUsage({ at: '2026-10-14T00:30:00Z', slot: 1, five: 0, fiveResetsAt: '2026-10-14T04:00:00Z', seven: 0, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 2 });
  ctx.seed.slotUsage({ at: '2026-10-14T00:30:00Z', slot: 3, five: 99, fiveResetsAt: '2026-10-14T04:00:00Z', seven: 99, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 2 });
  await ctx.hq('slots', 'broker', '1', '--proof', 'req-5e6f');

  const quota = await ctx.hq('capacity', 'broker');

  expect(findPath(quota.json, 'broker')).toMatchObject({ state: 'read', slot: 1, used: 0, readAt: '2026-10-14T00:30:00Z' });
});

test('it answers hq whois with the fleet session hq fleet saw under an id and its roles, and null for any other id', async () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ stu: 'id-stu' }));
  const stu = await ctx.hq('whois', 'id-stu');
  const teapot = await ctx.hq('whois', 'id-teapot');
  expect([stu.json, teapot.json]).toStrictEqual([
    { ok: true, session: 'id-stu', name: 'stu', roles: ['owner'] },
    { ok: true, session: 'id-teapot', name: null, roles: [] },
  ]);
});

test('hq band --json gives the segments the band mod draws, by the mod\'s own check', async () => {
  const ctx = setupTest();
  const shown = await ctx.hq('band');
  const segmentSchema = z.looseObject({ key: z.string() });
  const segments = z.object({ band: z.object({ segments: z.array(segmentSchema) }) }).parse(shown.json).band.segments;

  expect([shown.code, segments.map((segment) => segment.key), isSegmentList(segments)]).toStrictEqual([0, ['needs', 'nix', 'lanes', 'ci', 'reviews'], true]);
});

test('hq pane --json gives Markdown and a heat map the pane draws, by the mod\'s own check', async () => {
  const ctx = setupTest();
  const answer = await ctx.hq('pane');
  const pane = z.object({ pane: z.looseObject({ markdown: z.string(), heat: z.unknown() }) }).parse(answer.json).pane;
  expect([answer.code, pane.markdown.startsWith('## Needs you'), isHeatList(pane.heat)]).toStrictEqual([0, true, true]);
});

test.each([
  ['a capacity.sh reading', `echo '${JSON.stringify({ imp: { freeMib: 4096, room: true }, providers: { claude: { room: true, unattended: true, target: 'imp' } } })}'\n`],
  ['capacity.sh failing', 'echo invented: impd down >&2; exit 1\n'],
])('hq lanes warns, with %s, when the imp lanes, all full, would cross impd\'s non-Nix line', async (_case, script) => {
  const ctx = setupTest();
  mkdirSync(`${ctx.directory}/defs/scripts`, { recursive: true });
  writeFileSync(`${ctx.directory}/defs/scripts/capacity.sh`, script);
  writeFileSync(`${ctx.directory}/defs/pacing.json`, JSON.stringify({ imp: { impMib: 2048 }, lanes: { imp: { kettle: 6, teapot: 3 }, local: { flexible: 1 } } }));
  updateEnv('HQ_CAPACITY', `${ctx.directory}/defs/scripts/capacity.sh`);
  ctx.out.length = 0;
  const code = await main(['lanes', 'status']);

  expect([code, ctx.out.join('\n').split('\n').filter((line) => line.startsWith('imp lane plan:'))]).toStrictEqual([0, ["imp lane plan: 9 slot(s), all full, take 18432/16384 MiB and 18/16 vCPUs: over impd's non-Nix line; shrink the imp lanes in pacing.json or raise the line"]]);
});

test('hq run ship prints a vers PR shipped at its merge as at merge', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-510', '--title', 'Invented kettle work', '--where', 'none');
  await ctx.hq('run', 'pr', 'GEO-510', 'vers#20');
  closePR(ctx.db, 'vers#20', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-20T03:04:05Z', mergeSha: null } });
  await ctx.hq('run', 'state', 'GEO-510', 'merged');

  const bin = `${ctx.directory}/bin`;
  mkdirSync(bin);
  writeFileSync(`${bin}/gh`, ['#!/bin/sh', `echo '{"mergeCommit":{"oid":"${'a'.repeat(40)}"}}'`, ''].join('\n'));
  chmodSync(`${bin}/gh`, 0o755);
  updateEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`);
  ctx.out.length = 0;

  const code = await main(['run', 'ship']);

  expect(code).toBe(0);
  expect(ctx.out.join('\n')).toBe('Moved:\n  GEO-510 -> live-check: vers#20 at merge (2026-10-20T03:04:05Z)\n1 PR(s) newly marked shipped; 0 compare call(s).\n(messages held: HQ_NOTIFY=off)');
});

test.each([
  ['MERGED', { pr: { ref: 'kettle#20', state: 'closed' } }, { state: 'closed' }],
  ['OPEN', { error: { code: 'not_merged', message: 'kettle#21 is OPEN on GitHub, not merged; hq leaves it open' } }, { state: 'open' }],
])('it closes a run PR in hq with --superseded-by only when GitHub shows the replacement %s', async (ghState, reply, row) => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-517', '--title', 'Invented kettle work', '--where', 'none');
  await ctx.hq('run', 'pr', 'GEO-517', 'kettle#20');
  const bin = `${ctx.directory}/bin`;
  mkdirSync(bin, { recursive: true });
  writeFileSync(`${bin}/gh`, ['#!/bin/sh', `echo '{"state":"${ghState}"}'`, ''].join('\n'));
  chmodSync(`${bin}/gh`, 0o755);
  updateEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`);

  const result = await ctx.hq('run', 'closed', 'kettle#20', '--superseded-by', 'kettle#21');

  expect(result.json).toMatchObject(reply);
  expect(requirePR(ctx.db, 'kettle#20')).toMatchObject(row);
});

test('it logs the merged replacement with the close event', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-518', '--title', 'Invented kettle work', '--where', 'none');
  await ctx.hq('run', 'pr', 'GEO-518', 'kettle#22');
  const bin = `${ctx.directory}/bin`;
  mkdirSync(bin, { recursive: true });
  writeFileSync(`${bin}/gh`, ['#!/bin/sh', 'echo \'{"state":"MERGED"}\'', ''].join('\n'));
  chmodSync(`${bin}/gh`, 0o755);
  updateEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`);

  await ctx.hq('run', 'closed', 'kettle#22', '--superseded-by', 'kettle#23');

  const closed = readEvents(ctx.db, 'run', 'GEO-518', ['closed']);
  expect(closed.map((event) => parseJSON(event.data))).toStrictEqual([{ ref: 'kettle#22', supersededBy: 'kettle#23' }]);
});

test.each(['https://github.com/cedar-labs/kettle/pull/21', 'cedar-labs/kettle#21'])('it refuses --superseded-by %s, which names an owner', async (named) => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-520', '--title', 'Invented kettle work', '--where', 'none');
  await ctx.hq('run', 'pr', 'GEO-520', 'kettle#26');

  const refused = await ctx.hq('run', 'closed', 'kettle#26', '--superseded-by', named);

  expect(findPath(refused.json, 'error')).toStrictEqual({ code: 'bad_args', message: `--superseded-by takes repo#n, not "${named}"` });
  expect(requirePR(ctx.db, 'kettle#26')).toMatchObject({ state: 'open' });
});

test('it refuses --superseded-by on hq run merged', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-519', '--title', 'Invented kettle work', '--where', 'none');
  await ctx.hq('run', 'pr', 'GEO-519', 'kettle#24');

  const refused = await ctx.hq('run', 'merged', 'kettle#24', '--superseded-by', 'kettle#21');

  expect(findPath(refused.json, 'error')).toStrictEqual({ code: 'bad_args', message: '--superseded-by goes with hq run closed: a merged PR supersedes nothing' });
});

test('hq run tidy --dry-run says what it would do to a merged run and writes no row', async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', `${ctx.directory}/atc.sock`));
  const roster = [
    { id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: createPushedClone(ctx.directory, 'kettle-clone') },
    { id: '0000d009-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'z-kettle', alive: true, state: 'done' },
  ];
  const atc = fakeAtc(ctx.directory, roster);
  onTestFinished(atc.stop);
  await ctx.hq('run', 'add', 'GEO-514', '--session', '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '--title', 'Invented kettle work', '--where', 'none');
  await ctx.hq('run', 'pr', 'GEO-514', 'kettle#14');
  closePR(ctx.db, 'kettle#14', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-20T03:04:05Z', mergeSha: null } });
  await ctx.hq('run', 'state', 'GEO-514', 'merged', '--force');
  onTestFinished(overrideEnv('HQ_AS', undefined));
  onTestFinished(overrideEnv('ATC_SESSION_ID', '0000d009-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
  const countRows = () => ctx.db.query('SELECT (SELECT COUNT(*) FROM events) AS events, (SELECT COUNT(*) FROM run_notes) AS notes, (SELECT COUNT(*) FROM news) AS news, (SELECT COUNT(*) FROM meta) AS meta').get();
  const before = countRows();
  ctx.out.length = 0;

  const code = await main(['run', 'tidy', '--dry-run']);

  expect(code).toBe(0);
  expect(ctx.out.join('\n')).toBe('Would tidy (nothing changed):\n  GEO-514: Wrap-up: would forget 0000d001.');
  expect(countRows()).toStrictEqual(before);
});

test('hq run tidy wraps a merged run up, and finds nothing to tidy when it runs again', async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', `${ctx.directory}/atc.sock`));
  const roster = [{ id: '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: createPushedClone(ctx.directory, 'kettle-clone') }];
  const atc = fakeAtc(ctx.directory, roster);
  onTestFinished(atc.stop);
  await ctx.hq('run', 'add', 'GEO-515', '--session', '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '--title', 'Invented kettle work', '--where', 'none');
  await ctx.hq('run', 'pr', 'GEO-515', 'kettle#15');
  closePR(ctx.db, 'kettle#15', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-20T03:04:05Z', mergeSha: null } });
  await ctx.hq('run', 'state', 'GEO-515', 'merged', '--force');
  ctx.out.length = 0;

  const first = await main(['run', 'tidy']);
  const firstText = ctx.out.join('\n');
  ctx.out.length = 0;
  const again = await main(['run', 'tidy']);

  expect(first).toBe(0);
  expect(firstText).toBe('Tidied:\n  GEO-515: Wrap-up: forgot 0000d001.');
  expect(again).toBe(0);
  expect(ctx.out.join('\n')).toBe('No merged run to tidy.');
});

test('hq run ship lists a run whose helper is still active as left, and moves nothing', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-513', '--title', 'Invented kettle work', '--where', 'none');
  await ctx.hq('run', 'pr', 'GEO-513', 'vers#22');
  closePR(ctx.db, 'vers#22', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-20T03:04:05Z', mergeSha: null } });
  await ctx.hq('run', 'state', 'GEO-513', 'merged');
  await ctx.hq('run', 'session', 'GEO-513', '513ab0c0-0000-4000-8000-00000000beef', '--add');

  const bin = `${ctx.directory}/bin`;
  mkdirSync(bin);
  writeFileSync(`${bin}/gh`, ['#!/bin/sh', `echo '{"mergeCommit":{"oid":"${'c'.repeat(40)}"}}'`, ''].join('\n'));
  chmodSync(`${bin}/gh`, 0o755);

  const ran = Bun.spawnSync(['bun', 'src/cli.ts', 'run', 'ship'], { env: { ...process.env, HQ_DB: ctx.path, HQ_NOTIFY: 'off', PATH: `${bin}:${process.env['PATH'] ?? ''}` } });

  expect([ran.exitCode, ran.stdout.toString()]).toStrictEqual([0, 'Moved nothing.\n1 PR(s) newly marked shipped; 0 compare call(s).\n  left: GEO-513 has session 513ab0c0 still active\n']);
});

test('hq run ship lists a run put in deploy-held after its release as left held', async () => {
  const ctx = setupTest();
  await ctx.hq('run', 'add', 'GEO-511', '--title', 'Invented kettle work', '--where', 'none');
  await ctx.hq('run', 'pr', 'GEO-511', 'vers#21');
  closePR(ctx.db, 'vers#21', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-10T03:04:05Z', mergeSha: null } });
  await ctx.hq('run', 'state', 'GEO-511', 'deploy-held', '--next', 'Waits on the kettle host to switch.');

  const bin = `${ctx.directory}/bin`;
  mkdirSync(bin);
  writeFileSync(`${bin}/gh`, ['#!/bin/sh', `echo '{"mergeCommit":{"oid":"${'b'.repeat(40)}"}}'`, ''].join('\n'));
  chmodSync(`${bin}/gh`, 0o755);
  updateEnv('PATH', `${bin}:${process.env['PATH'] ?? ''}`);
  ctx.out.length = 0;

  const code = await main(['run', 'ship']);

  expect(code).toBe(0);
  expect(ctx.out.join('\n')).toBe('Moved nothing.\n1 PR(s) newly marked shipped; 0 compare call(s).\n  left held: GEO-511 was put in deploy-held after the release that holds its PRs');
});

test('hq pr override and accept-risk refuse a chat source named by --by and HQ_AS when no session id proves the owner', async () => {
  const ctx = setupTest();
  updateEnv('ATC_SESSION_ID', undefined);

  const override = await ctx.hq('pr', 'override', 'widgets', '7', '--source', 'chat:kettle-1', '--by', 'stu', '--note', 'Teapot is fine.');
  const acceptRisk = await ctx.hq('pr', 'accept-risk', 'widgets', '7', 'f1f1f1f1f1f1f1f1', '--source', 'chat:kettle-1', '--by', 'stu', '--note', 'Teapot is fine.');

  expect([override.code === 0, findPath(override.json, 'error', 'code'), z.string().parse(findPath(override.json, 'error', 'message')).endsWith('; ask stu to record it')]).toStrictEqual([false, 'bad_args', true]);
  expect([acceptRisk.code === 0, findPath(acceptRisk.json, 'error', 'code'), z.string().parse(findPath(acceptRisk.json, 'error', 'message')).endsWith('; ask stu to record it')]).toStrictEqual([false, 'bad_args', true]);
});

test('hq call answer refuses and saves nothing when atc cannot say whether the caller is the owner session', async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('ATC_SESSION_ID', 'id-stu'));
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', `${ctx.directory}/no-kettle-here.sock`));
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'stu': 'id-stu' }));
  await ctx.hq('call', 'add', 'KET-31', '--title', 'Pour widgets#7 now?', '--question', 'Boil?', '--body', 'Invented.');
  await ctx.hq('open');

  const answered = await ctx.hq('call', 'answer', 'KET-31', '--answer', 'Yes');
  const shown = await ctx.hq('call', 'show', 'KET-31', '--history');

  expect([answered.code === 0, findPath(answered.json, 'error', 'code'), findPath(answered.json, 'error', 'message')]).toStrictEqual([
    false,
    'atc_unreachable',
    "atc could not say whether this caller is the owner's session (stu), so the answer is not saved: Failed to connect. Run it again once atc answers, or answer in the console",
  ]);
  const history = z.array(z.looseObject({ action: z.string() })).parse(findPath(shown.json, 'history'));
  expect([findPath(shown.json, 'call', 'state'), history.map((event) => event.action)]).toStrictEqual(['open', ['added', 'opened']]);
});

test("hq call answer ignores a daemon at HQ_ATC_SOCKET that names the owner's session, and saves nothing", async () => {
  const ctx = setupTest();
  const daemon = startStubAtcDaemon(`${ctx.directory}/forged-kettle.sock`, {}, { peerSession: 'id-stu' });
  onTestFinished(daemon.stop);
  onTestFinished(overrideEnv('HQ_ATC_SOCKET', daemon.path));
  onTestFinished(overrideEnv('ATC_SESSION_ID', 'id-stu'));
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'stu': 'id-stu' }));
  await ctx.hq('call', 'add', 'KET-32', '--title', 'Pour widgets#8 now?', '--question', 'Boil?', '--body', 'Invented.');
  await ctx.hq('open');

  const answered = await ctx.hq('call', 'answer', 'KET-32', '--answer', 'Yes');

  expect([answered.code === 0, findPath(answered.json, 'error', 'code'), daemon.requests]).toStrictEqual([false, 'atc_unreachable', []]);
});

test("hq call answer from a caller hq cannot place as the owner saves the answer with no owner mark", async () => {
  const ctx = setupTest();
  await ctx.hq('call', 'add', 'KET-33', '--title', 'Pour widgets#9 now?', '--question', 'Boil?', '--body', 'Invented.');
  await ctx.hq('open');

  const answered = await ctx.hq('call', 'answer', 'KET-33', '--answer', 'Yes', '--by', 'stu');

  expect([answered.code, ctx.db.query("SELECT json_extract(data, '$.ownerSession') AS mark FROM events WHERE subject_id = 'KET-33' AND action = 'answered'").all()]).toStrictEqual([0, [{ mark: null }]]);
});

test.each([
  ["the owner's recorded session", 'id-stu', 1],
  ['another session', 'id-kettle', null],
])('hq call answer from a caller atc finds in %s saves the answer with the right owner mark', async (_case, peerSession, mark) => {
  const ctx = setupTest();
  OWNER_PROBE_OPENER.open = () => Promise.resolve({ peerSession, close: () => {} });
  onTestFinished(() => {
    OWNER_PROBE_OPENER.open = null;
  });
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'stu': 'id-stu' }));
  await ctx.hq('call', 'add', 'KET-34', '--title', 'Pour widgets#10 now?', '--question', 'Boil?', '--body', 'Invented.');
  await ctx.hq('open');

  const answered = await ctx.hq('call', 'answer', 'KET-34', '--answer', 'Yes');

  expect([answered.code, ctx.db.query("SELECT json_extract(data, '$.ownerSession') AS mark FROM events WHERE subject_id = 'KET-34' AND action = 'answered'").all()]).toStrictEqual([0, [{ mark }]]);
});

test('hq console login with no console running says how to start one, and prints no link', async () => {
  const ctx = setupTest();
  const refused = await ctx.hq('console', 'login');

  expect(refused.code).toBe(1);
  expect(findPath(refused.json, 'error')).toStrictEqual({ code: 'not_running', message: expect.stringContaining('no hq console answers at /nonexistent/hq-test-no-console.sock: start it with hq console in your own terminal') });
});
