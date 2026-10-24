import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHistoryRows, createLookalikeRows, createStoreRows, createStoreTables } from '../../test/create-history-databases.ts';
import { freshDb } from '../../test/helpers.ts';
import { createStoreBackup } from '../noslop/create-store-backup.ts';
import type { RunResult } from '../runner/types.ts';
import { REKEY_SPECS } from './rekey-specs.ts';
import type { ArchiveInput } from './run-archive-history.ts';
import { runArchiveHistory } from './run-archive-history.ts';

function runQuiet(): Promise<RunResult> {
  return Promise.resolve({ code: 1, stdout: '', stderr: '' });
}

function runBusy(): Promise<RunResult> {
  return Promise.resolve({ code: 0, stdout: '4242 bun /x/zgeoff/noslop/apps/cli/src/cli.ts review\n', stderr: '' });
}

function setupTest() {
  const base = freshDb(),
    store = `${base.dir}/xdg/noslop/store.sqlite`;
  onTestFinished(base.cleanup);
  createStoreTables(store);
  return {
    ...base,
    store,
    archive: (from: string, to: string, extra: Partial<ArchiveInput> = {}) =>
      runArchiveHistory({
        actor: 'z-stu',
        createBackup: createStoreBackup,
        db: base.db,
        dbFile: base.path,
        dryRun: false,
        from,
        openStore: (file, options) => new Database(file, options),
        reviewDir: `${base.dir}/reviews`,
        run: runQuiet,
        store,
        to,
        ...extra,
      }),
    createHistoryRows: (repo: string, offset: number) => createHistoryRows(base.db, repo, offset),
    createLookalikeRows: () => createLookalikeRows(base.db),
    createStoreRows: (repo: string, offset: number) => createStoreRows(store, repo, offset),
  };
}

function readTableRows(db: Database, tables: string[]): Record<string, unknown[]> {
  return Object.fromEntries(tables.map((table) => [table, db.query(`SELECT * FROM "${table}" ORDER BY rowid`).all()]));
}

function readStoreRows(path: string): Record<string, unknown[]> {
  const store = new Database(path, { readonly: true });
  try {
    return readTableRows(store, [...new Set(REKEY_SPECS.noslop.map((spec) => spec.table))]);
  } finally {
    store.close();
  }
}

function readHistoryRows(db: Database): Record<string, unknown[]> {
  return readTableRows(db, [...new Set(REKEY_SPECS.hq.map((spec) => spec.table))]);
}

interface Located {
  db: Database;
  store: string;
}

interface AllRows {
  hq: Record<string, unknown[]>;
  store: Record<string, unknown[]>;
}

function readAllRows(ctx: Located): AllRows {
  return { hq: readHistoryRows(ctx.db), store: readStoreRows(ctx.store) };
}

function readBackupNames(dbFile: string): string[] {
  return readdirSync(dirname(dbFile)).filter((name) => name.includes('.bak-'));
}

// The archived row is finding f1 on pull request 1, source s, at 2026-10-01T00:00:00Z.
function writeStoreDisposition(path: string, pullRequest: number, source: string): void {
  const store = new Database(path);
  store.query("INSERT INTO dispositions (repo, finding_id, kind, value, author, author_is_owner, source, at, pull_request) VALUES ('zgeoff/hq', 'f1', 'fixed', 'x', 'a', 1, ?, '2026-10-01T00:00:00Z', ?)").run(source, pullRequest);
  store.close();
}

function writeMergedPr(db: Database): void {
  db.query("INSERT INTO merged_prs (repo, number, merged_at, title, kind) VALUES ('hq', 2, '2026-10-02T00:00:00Z', 'a newer change', 'fix')").run();
}

function readBackupRepo(path: string | undefined): unknown[] {
  const copy = new Database(path ?? '', { readonly: true });
  try {
    return copy.query('SELECT repo FROM merged_prs').all();
  } finally {
    copy.close();
  }
}

test('it re-keys exactly the listed columns, in both databases', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  ctx.createLookalikeRows();
  ctx.createStoreRows('hq', 0);
  await ctx.archive('hq', 'hq-archive');
  expect(ctx.db.query('SELECT repo FROM ci_runs ORDER BY id').all()).toStrictEqual([{ repo: 'hq-archive' }, { repo: 'hq-tools' }]);
  expect(ctx.db.query('SELECT ref, fixed_in_pr FROM run_prs').all()).toStrictEqual([{ ref: 'hq-archive#5', fixed_in_pr: 'hq-archive#6' }]);
  expect(ctx.db.query('SELECT target FROM grant_actions ORDER BY id').all()).toStrictEqual([{ target: 'hq-archive#7' }, { target: 'hq#abc' }, { target: 'hq-old#4' }]);
  expect(ctx.db.query('SELECT ref FROM marks ORDER BY id').all()).toStrictEqual([{ ref: 'https://github.com/zgeoff/hq-archive/pull/8' }, { ref: 'https://github.com/other/hq/pull/5' }]);
  expect(ctx.db.query('SELECT link FROM news ORDER BY id').all()).toStrictEqual([{ link: 'https://github.com/zgeoff/hq-archive/pull/9' }, { link: 'https://github.com/zgeoff/hq-tools/pull/6' }]);
  expect(ctx.db.query('SELECT key FROM goal_days').all()).toStrictEqual([{ key: 'hq-archive' }]);
  expect(readStoreRows(ctx.store)).toMatchObject({
    reviews: [{ repo: 'zgeoff/hq-archive' }],
    dispositions: [{ repo: 'zgeoff/hq-archive' }],
    escapes: [{ repo: 'zgeoff/hq-archive' }],
    findings: [{ comment_url: 'https://github.com/zgeoff/hq-archive/pull/1#discussion_r1' }],
  });
});

test('it re-keys the cached PR facts of the stats with the rest of hq.db', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  ctx.db.query("INSERT INTO meta (key, value) VALUES ('stats_pr_facts_v2', ?)").run(JSON.stringify({ 'hq#5': { lines: 40, stacked: false }, 'hq-tools#5': { lines: 3, stacked: true }, 'hq#abc': { lines: 1, stacked: false } }));
  await ctx.archive('hq', 'hq-archive');
  expect(ctx.db.query("SELECT value FROM meta WHERE key = 'stats_pr_facts_v2'").get()).toStrictEqual({
    value: JSON.stringify({ 'hq-archive#5': { lines: 40, stacked: false }, 'hq-tools#5': { lines: 3, stacked: true }, 'hq#abc': { lines: 1, stacked: false } }),
  });
});

test('it counts the cached PR facts of the stats on a dry run, and changes nothing', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  ctx.db.query("INSERT INTO meta (key, value) VALUES ('stats_pr_facts_v2', ?)").run(JSON.stringify({ 'hq#5': { lines: 40, stacked: false }, 'hq#6': { lines: 2, stacked: true }, 'hq-archive#1': { lines: 9, stacked: false } }));
  {
    const result = await ctx.archive('hq', 'hq-archive', { dryRun: true });
    expect(result.before[0]?.counts.find((count) => count.table === 'meta')).toStrictEqual({ table: 'meta', column: 'value', from: 2, to: 1 });
    expect(result.after[0]?.counts.find((count) => count.table === 'meta')).toStrictEqual({ table: 'meta', column: 'value', from: 0, to: 3 });
    expect(ctx.db.query("SELECT value FROM meta WHERE key = 'stats_pr_facts_v2'").get()).toStrictEqual({ value: JSON.stringify({ 'hq#5': { lines: 40, stacked: false }, 'hq#6': { lines: 2, stacked: true }, 'hq-archive#1': { lines: 9, stacked: false } }) });
  }
});

test('it refuses a cached PR fact that would repeat a key, names it, and changes nothing', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  ctx.db.query("INSERT INTO meta (key, value) VALUES ('stats_pr_facts_v2', ?)").run(JSON.stringify({ 'hq#5': { lines: 40, stacked: false }, 'hq-archive#5': { lines: 2, stacked: true } }));
  {
    const before = readHistoryRows(ctx.db);
    await expect(ctx.archive('hq', 'hq-archive')).rejects.toThrow('meta.stats_pr_facts_v2=hq-archive#5');
    expect(readHistoryRows(ctx.db)).toStrictEqual(before);
  }
});

test('it leaves free text and hq as the tool alone', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  ctx.createLookalikeRows();
  await ctx.archive('hq', 'hq-archive');
  expect(ctx.db.query("SELECT text FROM marks WHERE ref LIKE '%hq-archive%'").all()).toStrictEqual([{ text: 'changed hq and the hq tool' }]);
  expect(ctx.db.query("SELECT text FROM news WHERE link LIKE '%hq-archive%'").all()).toStrictEqual([{ text: 'merged a change to hq itself, hq' }]);
  expect(ctx.db.query("SELECT subject_id, actor FROM events WHERE action = 'noted'").all()).toStrictEqual([{ subject_id: 'hq', actor: 'hq' }]);
});

test('it restores identical rows when hq goes to hq-archive and back', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  ctx.createLookalikeRows();
  ctx.createStoreRows('hq', 0);
  {
    const before = readAllRows(ctx);
    await ctx.archive('hq', 'hq-archive');
    await ctx.archive('hq-archive', 'hq');
    expect(readAllRows(ctx)).toStrictEqual(before);
  }
});

test('it keeps a row written as hq between the two runs, and the way back still succeeds', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  ctx.createStoreRows('hq', 0);
  await ctx.archive('hq', 'hq-archive');
  ctx.createHistoryRows('hq', 100);
  ctx.createStoreRows('hq', 100);
  await ctx.archive('hq-archive', 'hq');
  expect(ctx.db.query('SELECT repo FROM merged_prs ORDER BY number').all()).toStrictEqual([{ repo: 'hq' }, { repo: 'hq' }]);
  expect(ctx.db.query('SELECT ref FROM run_prs ORDER BY ref').all()).toStrictEqual([{ ref: 'hq#105' }, { ref: 'hq#5' }]);
  expect(readStoreRows(ctx.store)).toMatchObject({ dispositions: [{ repo: 'zgeoff/hq' }, { repo: 'zgeoff/hq' }] });
});

test('it refuses a repeated key in hq.db, names it, and changes nothing', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  await ctx.archive('hq', 'hq-archive');
  writeMergedPr(ctx.db);
  {
    const before = { hq: readHistoryRows(ctx.db), backups: readBackupNames(ctx.path) };
    await expect(ctx.archive('hq-archive', 'hq')).rejects.toThrow('merged_prs.repo=hq (number=2)');
    expect({ hq: readHistoryRows(ctx.db), backups: readBackupNames(ctx.path) }).toStrictEqual(before);
  }
});

test('it refuses a repeated finding in the store, names it, and changes nothing', async () => {
  const ctx = setupTest();
  ctx.createStoreRows('hq', 0);
  await ctx.archive('hq', 'hq-archive');
  writeStoreDisposition(ctx.store, 1, 's');
  {
    const before = readStoreRows(ctx.store);
    await expect(ctx.archive('hq-archive', 'hq')).rejects.toThrow('dispositions.repo=zgeoff/hq (pull_request=1, finding_id=f1, source=s, at=2026-10-01T00:00:00Z)');
    expect(readStoreRows(ctx.store)).toStrictEqual(before);
  }
});

test('it re-keys back when a new disposition shares a finding id with an archived one on another pull request', async () => {
  const ctx = setupTest();
  ctx.createStoreRows('hq', 0);
  await ctx.archive('hq', 'hq-archive');
  writeStoreDisposition(ctx.store, 2, 's');
  await ctx.archive('hq-archive', 'hq');
  expect(readStoreRows(ctx.store)).toMatchObject({ dispositions: [{ repo: 'zgeoff/hq', pull_request: 1 }, { repo: 'zgeoff/hq', pull_request: 2 }] });
});

test('it refuses while a noslop process runs, before any backup or change', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  {
    const before = readHistoryRows(ctx.db);
    await expect(ctx.archive('hq', 'hq-archive', { run: runBusy })).rejects.toThrow('process 4242');
    expect(readHistoryRows(ctx.db)).toStrictEqual(before);
  }
  expect(readBackupNames(ctx.path)).toStrictEqual([]);
});

test('it refuses when the name being left has no rows', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  await expect(ctx.archive('hq-nothing', 'hq-archive')).rejects.toThrow('nothing to re-key');
});

test.each([
  ['', 'hq-archive', 'is not a repo name'],
  ['hq', 'hq', 'both repo names are hq'],
  ['hq', "hq'; DROP TABLE runs; --", 'is not a repo name'],
  ['hq/x', 'hq-archive', 'is not a repo name'],
])('it refuses the repo names %p and %p', async (from, to, why) => {
  const ctx = setupTest();
  await expect(ctx.archive(from, to)).rejects.toThrow(why);
});

test('it backs up hq.db and the store first, as copies that hold the old names', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  ctx.createStoreRows('hq', 0);
  {
    const result = await ctx.archive('hq', 'hq-archive');
    expect(result.backups).toHaveLength(2);
    expect(result.backups.map((path) => existsSync(path))).toStrictEqual([true, true]);
    expect(result.backups[0]).toMatch(/hq\.db\.bak-archive-/u);
    expect(result.backups[1]).toMatch(/store\.sqlite\.bak-archive-/u);
    expect(readBackupRepo(result.backups[0])).toStrictEqual([{ repo: 'hq' }]);
  }
});

test('it changes nothing, writes no backup, and prints the counts on a dry run', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  ctx.createStoreRows('hq', 0);
  {
    const before = readAllRows(ctx),
      result = await ctx.archive('hq', 'hq-archive', { dryRun: true, run: runBusy });
    expect(readAllRows(ctx)).toStrictEqual(before);
    expect(result).toMatchObject({ dryRun: true, backups: [] });
    expect(result.before[0]?.counts.find((count) => count.table === 'merged_prs')).toStrictEqual({ table: 'merged_prs', column: 'repo', from: 1, to: 0 });
    expect(result.after[0]?.counts.find((count) => count.table === 'merged_prs')).toStrictEqual({ table: 'merged_prs', column: 'repo', from: 0, to: 1 });
    expect(readBackupNames(ctx.path)).toStrictEqual([]);
  }
});

test('it reports a repeated key on a dry run, and still changes nothing', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  await ctx.archive('hq', 'hq-archive');
  writeMergedPr(ctx.db);
  {
    const result = await ctx.archive('hq-archive', 'hq', { dryRun: true });
    expect(result.before[0]?.collisions).toStrictEqual(['merged_prs.repo=hq (number=2)']);
  }
});

test('it reports a partial re-key that names the backups when the store refuses its update after hq.db commits', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  ctx.createStoreRows('hq', 0);
  {
    const store = new Database(ctx.store);
    store.exec("CREATE TRIGGER refuse_review_update BEFORE UPDATE ON reviews BEGIN SELECT RAISE(ABORT, 'invented refusal'); END");
    store.close();
  }
  {
    const before = readStoreRows(ctx.store),
      failure = await ctx.archive('hq', 'hq-archive').then(
        () => null,
        (error: unknown) => error,
      );
    {
      const backups = [...readBackupNames(ctx.path).map((name) => `${ctx.dir}/${name}`), ...readBackupNames(ctx.store).map((name) => `${dirname(ctx.store)}/${name}`)];
      expect(backups).toStrictEqual([expect.stringMatching(/\/hq\.db\.bak-archive-/u), expect.stringMatching(/\/store\.sqlite\.bak-archive-/u)]);
      expect(failure).toMatchObject({ code: 'rekey_partial', data: { backups } });
      expect(failure).toHaveProperty('message', `hq.db was re-keyed but noslop's store was not (invented refusal). The backups are ${backups.join(' and ')}.`);
      expect(ctx.db.query('SELECT repo FROM merged_prs').all()).toStrictEqual([{ repo: 'hq-archive' }]);
      expect(readStoreRows(ctx.store)).toStrictEqual(before);
    }
  }
});

test('it reports a partial re-key that names the backups when the store refuses a write open after hq.db commits', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  ctx.createStoreRows('hq', 0);
  const writeRefused = new Error('invented: the store opens read-only');

  const failure = await ctx.archive('hq', 'hq-archive', {
    openStore: (file, options) => {
      if ('create' in options) {
        throw writeRefused;
      }
      return new Database(file, options);
    },
  }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(failure).toMatchObject({ code: 'rekey_partial', message: expect.stringContaining("hq.db was re-keyed but noslop's store was not (invented: the store opens read-only). The backups are ") });
  expect(ctx.db.query('SELECT repo FROM merged_prs').all()).toStrictEqual([{ repo: 'hq-archive' }]);
});

test('it works on hq.db alone when noslop has no store', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  {
    const result = await ctx.archive('hq', 'hq-archive', { store: `${ctx.dir}/none/store.sqlite` });
    expect(result.backups).toHaveLength(1);
    expect(result.before.map((side) => side.store)).toStrictEqual(['hq']);
    expect(ctx.db.query('SELECT repo FROM merged_prs').all()).toStrictEqual([{ repo: 'hq-archive' }]);
  }
});

test("it moves the repo's review files, in its folder and in the flat names, and leaves other repos' files alone", async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  mkdirSync(`${ctx.dir}/reviews/zgeoff/hq`, { recursive: true });
  mkdirSync(`${ctx.dir}/reviews/zgeoff/hq-private`, { recursive: true });
  writeFileSync(`${ctx.dir}/reviews/zgeoff/hq/12-review.md`, 'kettle review');
  writeFileSync(`${ctx.dir}/reviews/zgeoff/hq-private/12-review.md`, 'teapot review');
  writeFileSync(`${ctx.dir}/reviews/hq7-review.md`, 'old kettle review');
  writeFileSync(`${ctx.dir}/reviews/hq-private7-review.md`, 'old teapot review');

  const result = await ctx.archive('hq', 'hq-archive');

  expect(result.reviewFiles).toStrictEqual([
    { from: `${ctx.dir}/reviews/zgeoff/hq/12-review.md`, to: `${ctx.dir}/reviews/zgeoff/hq-archive/12-review.md`, collides: false },
    { from: `${ctx.dir}/reviews/hq7-review.md`, to: `${ctx.dir}/reviews/hq-archive7-review.md`, collides: false },
  ]);
  expect(readdirSync(`${ctx.dir}/reviews`, { recursive: true }).map(String).toSorted()).toStrictEqual(['hq-archive7-review.md', 'hq-private7-review.md', 'zgeoff', 'zgeoff/hq-archive', 'zgeoff/hq-archive/12-review.md', 'zgeoff/hq-private', 'zgeoff/hq-private/12-review.md']);
});

test('it refuses a review file that would land on another, names it, and moves and changes nothing', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  mkdirSync(`${ctx.dir}/reviews/zgeoff/hq`, { recursive: true });
  mkdirSync(`${ctx.dir}/reviews/zgeoff/hq-archive`, { recursive: true });
  writeFileSync(`${ctx.dir}/reviews/zgeoff/hq/12-review.md`, 'kettle review');
  writeFileSync(`${ctx.dir}/reviews/zgeoff/hq-archive/12-review.md`, 'archived kettle review');
  const before = readHistoryRows(ctx.db);

  await expect(ctx.archive('hq', 'hq-archive')).rejects.toMatchObject({ code: 'rekey_collision', message: expect.stringContaining(`review file: ${ctx.dir}/reviews/zgeoff/hq-archive/12-review.md`) });

  expect(readdirSync(`${ctx.dir}/reviews/zgeoff/hq`)).toStrictEqual(['12-review.md']);
  expect(readHistoryRows(ctx.db)).toStrictEqual(before);
  expect(readBackupNames(ctx.path)).toStrictEqual([]);
});

test('it lists the review files it would move on a dry run, and moves none', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  mkdirSync(`${ctx.dir}/reviews`, { recursive: true });
  writeFileSync(`${ctx.dir}/reviews/hq7-review.md`, 'old kettle review');

  const result = await ctx.archive('hq', 'hq-archive', { dryRun: true });

  expect(result.reviewFiles).toStrictEqual([{ from: `${ctx.dir}/reviews/hq7-review.md`, to: `${ctx.dir}/reviews/hq-archive7-review.md`, collides: false }]);
  expect(readdirSync(`${ctx.dir}/reviews`)).toStrictEqual(['hq7-review.md']);
});

test('it moves the review files of a repo that has no rows left', async () => {
  const ctx = setupTest();
  mkdirSync(`${ctx.dir}/reviews`, { recursive: true });
  writeFileSync(`${ctx.dir}/reviews/hq7-review.md`, 'old kettle review');

  await ctx.archive('hq', 'hq-archive');

  expect(readdirSync(`${ctx.dir}/reviews`)).toStrictEqual(['hq-archive7-review.md']);
});

test('it logs one event naming both repos and the backups', async () => {
  const ctx = setupTest();
  ctx.createHistoryRows('hq', 0);
  {
    const result = await ctx.archive('hq', 'hq-archive');
    expect(ctx.db.query("SELECT actor, from_state, to_state, data FROM events WHERE action = 'archive-history'").all()).toMatchObject([
      { actor: 'z-stu', from_state: 'hq', to_state: 'hq-archive', data: expect.stringContaining(result.backups[0] ?? '') },
    ]);
  }
});
