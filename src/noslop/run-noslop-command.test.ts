import { Database } from 'bun:sqlite';
import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFakeRunner } from '../../test/noslop-fake.ts';
import { buildStubStoreQuery } from '../../test/build-stub-store-query.ts';
import { createStubNoslopClone } from '../../test/create-stub-noslop-clone.ts';
import { createStubNoslopStore } from '../../test/create-stub-noslop-store.ts';
import { main } from '../cli.ts';
import { overrideEnv } from '../config/override-env.ts';
import { openDb } from '../db/open-db.ts';
import { loadNoslopSettings } from './load-noslop-settings.ts';
import { updateNoslopRepos } from './update-noslop-repos.ts';
import { runNoslopCommand } from './run-noslop-command.ts';
import { recordRound } from './record-round.ts';
import type { Runner } from '../runner/types.ts';

function buildPinPaths(root: string) {
  const base = `${root}/repos/zgeoff/noslop`;
  return { base, folder: `${base}-0123456789abcdef0123456789abcdef01234567` };
}

function createDataHomeOverride(value: string): () => void {
  const saved = process.env['XDG_DATA_HOME'];
  process.env['XDG_DATA_HOME'] = value;
  return () => {
    if (saved === undefined) {
      delete process.env['XDG_DATA_HOME'];
    } else {
      process.env['XDG_DATA_HOME'] = saved;
    }
  };
}

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-noslop-command-')),
    db = openDb(join(base, 'hq.db'));

  onTestFinished(() => {
    db.close();
    rmSync(base, { recursive: true, force: true });
  });
  onTestFinished(overrideEnv('HQ_REPOS', join(base, 'repos')));
  onTestFinished(overrideEnv('HQ_NOSLOP_STORE', undefined));
  onTestFinished(createDataHomeOverride(join(base, 'data')));
  mkdirSync(join(base, 'data', 'noslop'), { recursive: true });
  onTestFinished(overrideEnv('REVIEW_DIR', join(base, 'reviews')));

  return { base, db, readBackups: () => readdirSync(join(base, 'data', 'noslop')).filter((name) => name.startsWith('store.sqlite.bak-')), store: join(base, 'data', 'noslop', 'store.sqlite') };
}

test('it shows noslop off everywhere, with no pin, until someone turns it on', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await expect(runNoslopCommand({ run: fake.run, db: ctx.db, verb: undefined, rest: [], since: undefined, actor: 'tester' })).resolves.toStrictEqual({
    data: { repos: [], caps: {}, sha: null, clone: `${ctx.base}/repos/zgeoff/noslop` },
    text: `repos: none (noslop is off everywhere)\nemergency review cap: off everywhere (hq noslop cap <repo> <n>)\npinned: nothing yet (hq noslop pin <sha>)\nclone: ${ctx.base}/repos/zgeoff/noslop (not cloned yet)`,
  });
});

test('it turns repos on and off, sorted, and the second identical call changes nothing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'on', rest: ['tools', 'atc'], since: undefined, actor: 'tester' });
  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'on', rest: ['tools', 'atc'], since: undefined, actor: 'tester' });
  expect(loadNoslopSettings(ctx.db).repos).toStrictEqual(['atc', 'tools']);

  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'off', rest: ['tools'], since: undefined, actor: 'tester' });
  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'off', rest: ['tools'], since: undefined, actor: 'tester' });

  expect(loadNoslopSettings(ctx.db).repos).toStrictEqual(['atc']);
  expect(fake.calls).toStrictEqual([]);
});

test('it sets a repo\'s emergency review cap, shows it in the listing, and logs who set it', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner();
  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'on', rest: ['atc', 'tools'], since: undefined, actor: 'tester' });

  const shown = await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'cap', rest: ['Tools', '2'], since: undefined, actor: 'tester' });

  expect(shown.data).toMatchObject({ repos: ['atc', 'tools'], caps: { tools: 2 } });
  expect(shown.text).toContain('emergency review cap: atc off, tools 2');
  expect(loadNoslopSettings(ctx.db)).toMatchObject({ repos: ['atc', 'tools'], caps: { tools: 2 } });
  expect(ctx.db.query("SELECT action, actor FROM events WHERE subject_id = 'noslop' AND action = 'cap'").all()).toStrictEqual([{ action: 'cap', actor: 'tester' }]);
});

test('it turns a repo\'s emergency review cap off again, and keeps the other caps and the repo list', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner();
  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'on', rest: ['atc'], since: undefined, actor: 'tester' });
  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'cap', rest: ['atc', '1'], since: undefined, actor: 'tester' });
  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'cap', rest: ['tools', '3'], since: undefined, actor: 'tester' });

  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'cap', rest: ['atc', 'off'], since: undefined, actor: 'tester' });

  expect(loadNoslopSettings(ctx.db)).toStrictEqual({ repos: ['atc'], sha: null, caps: { tools: 3 } });
});

test('it keeps the caps when a repo is turned off', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner();
  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'on', rest: ['atc'], since: undefined, actor: 'tester' });
  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'cap', rest: ['atc', '2'], since: undefined, actor: 'tester' });

  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'off', rest: ['atc'], since: undefined, actor: 'tester' });

  expect(loadNoslopSettings(ctx.db)).toStrictEqual({ repos: [], sha: null, caps: { atc: 2 } });
});

test.each([
  ['no repo', [], 'bare repo name'],
  ['a repo with an owner', ['zgeoff/atc', '2'], 'bare repo name'],
  ['no value', ['atc'], 'whole number'],
  ['zero', ['atc', '0'], 'whole number'],
  ['a word', ['atc', 'many'], 'whole number'],
  ['a fraction', ['atc', '1.5'], 'whole number'],
  ['a number past the safe integer range', ['atc', '1'.repeat(310)], 'whole number'],
  ['an extra argument', ['atc', '2', 'extra'], 'nothing more'],
])('it refuses hq noslop cap with %s', async (_label, rest, words) => {
  const ctx = setupTest();

  await expect(runNoslopCommand({ run: buildFakeRunner().run, db: ctx.db, verb: 'cap', rest, since: undefined, actor: 'tester' })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining(words) });

  expect(loadNoslopSettings(ctx.db).caps).toStrictEqual({});
});

test('it logs who turned a repo on', async () => {
  const ctx = setupTest();

  await runNoslopCommand({ run: buildFakeRunner().run, db: ctx.db, verb: 'on', rest: ['atc'], since: undefined, actor: 'tester' });

  expect(ctx.db.query("SELECT subject_id, action, actor, to_state FROM events WHERE subject_id = 'noslop'").all()).toStrictEqual([{ subject_id: 'noslop', action: 'on', actor: 'tester', to_state: 'atc' }]);
});

test.each([
  ['no sha', []],
  ['a sha that is too short', ['abc12']],
  ['a sha that is too long', ['a'.repeat(41)]],
  ['a sha that is not hex', ['not-a-sha']],
  ['an option', ['--force']],
])('it refuses to pin %s and runs nothing', async (_label, rest) => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await expect(runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest, since: undefined, actor: 'tester' })).rejects.toMatchObject({ code: 'bad_args' });

  expect(fake.calls).toStrictEqual([]);
  expect(loadNoslopSettings(ctx.db).sha).toBeNull();
});

test('it pins hq\'s own clone and records the full sha, keeping the list', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    paths = buildPinPaths(ctx.base);
  updateNoslopRepos(ctx.db, 'on', ['atc']);

  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' });

  expect(loadNoslopSettings(ctx.db)).toStrictEqual({ repos: ['atc'], sha: '0123456789abcdef0123456789abcdef01234567', caps: {} });
  expect(fake.lines()).toStrictEqual([
    String.raw`pgrep -af -- ${ctx.base.replaceAll('.', String.raw`\.`)}/repos/zgeoff/noslop[^ ]*/apps/cli/src/cli\.ts`,
    `gh repo clone zgeoff/noslop ${paths.base} -- -q`,
    'git fetch -q origin',
    'git rev-parse --verify 0123456^{commit}',
    `git worktree remove --force ${paths.folder}`,
    'git worktree prune',
    `git worktree add -q --detach ${paths.folder} 0123456789abcdef0123456789abcdef01234567`,
    'bun install --frozen-lockfile --ignore-scripts',
  ]);
  expect(fake.calls.map((c) => c.opts?.cwd)).toStrictEqual([undefined, `${ctx.base}/repos/zgeoff`, paths.base, paths.base, paths.base, paths.base, paths.base, paths.folder]);
});

test('it keeps a configured emergency cap when it pins', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner();
  updateNoslopRepos(ctx.db, 'on', ['widgets']);
  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'cap', rest: ['widgets', '2'], since: undefined, actor: 'tester' });

  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' });

  expect(loadNoslopSettings(ctx.db)).toStrictEqual({ repos: ['widgets'], sha: '0123456789abcdef0123456789abcdef01234567', caps: { widgets: 2 } });
});

test('it keeps a repo turned on while the install runs', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    run: Runner = (cmd, opts) => {
      if (cmd[0] === 'bun') {
        updateNoslopRepos(ctx.db, 'on', ['widgets']);
      }
      return fake.run(cmd, opts);
    };

  await runNoslopCommand({ run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' });

  expect(loadNoslopSettings(ctx.db).repos).toStrictEqual(['widgets']);
});

test('it keeps a repo turned on and a repo turned off while the store migration runs', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ storeQuery: buildStubStoreQuery(ctx.store, [ADD_0007]) });
  const paths = buildPinPaths(ctx.base);
  const run: Runner = (cmd, opts) => {
    if (cmd.includes('query')) {
      updateNoslopRepos(ctx.db, 'on', ['widgets']);
      updateNoslopRepos(ctx.db, 'off', ['atc']);
    }
    return fake.run(cmd, opts);
  };
  updateNoslopRepos(ctx.db, 'on', ['atc']);
  createStubNoslopStore(ctx.store, { migrations: HELD_NAMES, tables: { dispositions: 3, reviews: 2 } });
  createStubNoslopClone(paths.folder, NEW_NAMES);

  await runNoslopCommand({ run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' });

  expect(loadNoslopSettings(ctx.db)).toStrictEqual({ repos: ['widgets'], sha: FULL_SHA, caps: {} });
});

test('it refuses a pin while another pin\'s process still runs, however old its lock is', async () => {
  const ctx = setupTest();
  const sleeper = Bun.spawn(['sleep', '30']);
  onTestFinished(() => sleeper.kill());
  onTestFinished(overrideEnv('HQ_REVIEW_LOCK_WAIT_MS', '0'));
  const lock = join(ctx.base, 'reviews', '.lock-zgeoff-noslop-clone');
  mkdirSync(lock, { recursive: true });
  writeFileSync(join(lock, 'pid'), String(sleeper.pid));
  utimesSync(lock, new Date(Date.now() - 3_600_000), new Date(Date.now() - 3_600_000));

  await expect(runNoslopCommand({ run: buildFakeRunner().run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).rejects.toMatchObject({ code: 'locked' });

  expect(loadNoslopSettings(ctx.db).sha).toBeNull();
});

test('it runs two overlapping pins one after the other', async () => {
  const ctx = setupTest(),
    events: string[] = [],
    fake = buildFakeRunner(),
    gate = Promise.withResolvers<void>(),
    run: Runner = async (cmd, opts) => {
      if (cmd[0] === 'git' && cmd[1] === 'worktree' && cmd[2] === 'add') {
        events.push(`add ${cmd.at(-1)?.slice(0, 7)}`);
      }
      if (cmd[0] === 'bun' && events.length === 1) {
        await gate.promise;
      }
      return await fake.run(cmd, opts);
    },
    started = ['aaaaaaa', 'bbbbbbb'].map((sha) => runNoslopCommand({ run, db: ctx.db, verb: 'pin', rest: [sha], since: undefined, actor: 'tester' }));

  await Bun.sleep(600);
  expect(events).toStrictEqual(['add aaaaaaa']);
  gate.resolve();
  await Promise.all(started);

  expect(events).toStrictEqual(['add aaaaaaa', 'add bbbbbbb']);
});

test('it keeps the old pin when the checkout fails', async () => {
  const ctx = setupTest(),
    runner = buildFakeRunner();
  updateNoslopRepos(ctx.db, 'on', ['atc']);
  await runNoslopCommand({ run: runner.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' });

  await expect(runNoslopCommand({ run: () => Promise.resolve({ code: 1, stdout: '', stderr: 'bad object' }), db: ctx.db, verb: 'pin', rest: ['fffffff'], since: undefined, actor: 'tester' })).rejects.toMatchObject({ code: 'command_failed' });

  expect(loadNoslopSettings(ctx.db).sha).toBe('0123456789abcdef0123456789abcdef01234567');
});

const ADD_0007 = "INSERT INTO kysely_migration (name, timestamp) VALUES ('0007-dispositions-by-pull-request', '2026-10-20T00:00:00.000Z')",
  BUSY = { code: 0, stdout: '4242 bun /x/apps/cli/src/cli.ts review\n', stderr: '' },
  FULL_SHA = '0123456789abcdef0123456789abcdef01234567',
  HELD_NAMES = ['0001-the-store', '0002-dispositions-by-repo', '0003-calls-without-chunks', '0004-calls-with-cache-counts', '0005-reviews-without-step-up', '0006-dropped-findings'],
  NEW_NAMES = [...HELD_NAMES, '0007-dispositions-by-pull-request'];

test('it refuses a pin while a noslop CLI runs, names it, and checks nothing out', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ pgrep: { code: 0, stdout: '4242 bun --config=/x/bunfig.toml /x/apps/cli/src/cli.ts review --pr 354\n', stderr: '' } });

  await expect(runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).rejects.toMatchObject({
    code: 'noslop_busy',
    message: expect.stringContaining('process 4242: bun --config=/x/bunfig.toml /x/apps/cli/src/cli.ts review --pr 354'),
  });

  expect(fake.lines().filter((line) => !line.startsWith('pgrep'))).toStrictEqual([]);
  expect(loadNoslopSettings(ctx.db).sha).toBeNull();
});

test('it leaves hq itself out of the processes it names', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ pgrep: { code: 0, stdout: `${process.pid} bun /x/apps/cli/src/cli.ts\n`, stderr: '' } });

  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' });

  expect(loadNoslopSettings(ctx.db).sha).toBe(FULL_SHA);
});

test.each([[2], [127]])('it refuses a pin when pgrep fails with exit %d', async (code) => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ pgrep: { code, stdout: '', stderr: 'pgrep: invalid' } });

  await expect(runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).rejects.toMatchObject({ code: 'noslop_busy', message: expect.stringContaining('hq cannot tell') });

  expect(loadNoslopSettings(ctx.db).sha).toBeNull();
});

test('it refuses a pin while a review round is open, and names the PR', async () => {
  const ctx = setupTest(),
    sleeper = Bun.spawn(['sleep', '30']);
  onTestFinished(() => sleeper.kill());
  mkdirSync(join(ctx.base, 'reviews', `hq+354-noslop-${sleeper.pid}`), { recursive: true });

  await expect(runNoslopCommand({ run: buildFakeRunner().run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).rejects.toMatchObject({
    code: 'noslop_busy',
    message: expect.stringMatching(/round hq#354 \(review process \d+\), started \d{4}-/u),
  });

  expect(loadNoslopSettings(ctx.db).sha).toBeNull();
});

test('it pins when a live review removes its worktree between the scan and the read', async () => {
  const ctx = setupTest();
  const sleeper = Bun.spawn(['sleep', '30']);
  onTestFinished(() => sleeper.kill());
  mkdirSync(join(ctx.base, 'reviews'), { recursive: true });
  symlinkSync(join(ctx.base, 'reviews', 'removed'), join(ctx.base, 'reviews', `hq354-noslop-${sleeper.pid}`));

  await runNoslopCommand({ run: buildFakeRunner().run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' });

  expect(loadNoslopSettings(ctx.db).sha).toBe(FULL_SHA);
});

test('it ignores a review folder whose process is gone', async () => {
  const ctx = setupTest(),
    gone = Bun.spawn(['true']);
  await gone.exited;
  mkdirSync(join(ctx.base, 'reviews', `hq+354-noslop-${gone.pid}`), { recursive: true });

  await runNoslopCommand({ run: buildFakeRunner().run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' });

  expect(loadNoslopSettings(ctx.db).sha).toBe(FULL_SHA);
});

test('it refuses --force with no reason as bad_args, and runs nothing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await expect(runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], force: true, since: undefined, actor: 'tester' })).rejects.toMatchObject({ code: 'bad_args' });

  expect(fake.calls).toStrictEqual([]);
});

test('it goes on with --force and a reason while noslop runs, still backs up and counts, and records the reason', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ pgrep: { code: 0, stdout: '4242 bun /x/apps/cli/src/cli.ts review\n', stderr: '' }, storeQuery: buildStubStoreQuery(ctx.store, [ADD_0007]) }),
    paths = buildPinPaths(ctx.base);
  createStubNoslopStore(ctx.store, { migrations: HELD_NAMES, tables: { dispositions: 3 } });
  createStubNoslopClone(paths.folder, NEW_NAMES);

  await expect(runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456', 'invented', 'reason'], force: true, since: undefined, actor: 'tester' })).resolves.toMatchObject({
    text: expect.stringContaining('dispositions 3 → 3'),
  });

  expect(loadNoslopSettings(ctx.db).sha).toBe(FULL_SHA);
  expect(ctx.readBackups()).toHaveLength(1);
  expect(ctx.db.query("SELECT json_extract(data, '$.force') AS force, json_extract(data, '$.counts.dispositions.after') AS after FROM events WHERE action = 'pinned'").all()).toStrictEqual([{ force: 'invented reason', after: 3 }]);
});

test('it pins with no store migration, no backup and no store query when the store holds every migration', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    paths = buildPinPaths(ctx.base);
  createStubNoslopStore(ctx.store, { migrations: NEW_NAMES, tables: { dispositions: 2 } });
  createStubNoslopClone(paths.folder, NEW_NAMES);

  await expect(runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).resolves.toMatchObject({ text: `repos: none (noslop is off everywhere)\nemergency review cap: off everywhere (hq noslop cap <repo> <n>)\npinned: ${FULL_SHA}\nclone: ${paths.folder}\nno store migration` });

  expect(ctx.readBackups()).toStrictEqual([]);
  expect(fake.of('bun')).toStrictEqual([]);
  expect(loadNoslopSettings(ctx.db).sha).toBe(FULL_SHA);
});

test('it backs up the store, counts every table and pins when a migration is new', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ storeQuery: buildStubStoreQuery(ctx.store, [ADD_0007]) }),
    paths = buildPinPaths(ctx.base);
  createStubNoslopStore(ctx.store, { migrations: HELD_NAMES, tables: { dispositions: 3, reviews: 2 } });
  createStubNoslopClone(paths.folder, NEW_NAMES);

  await expect(runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).resolves.toMatchObject({
    text: expect.stringMatching(/\nstore migration: 0007-dispositions-by-pull-request; backup \S+\.bak-0123456-\d{8}T\d{6}Z; dispositions 3 → 3, kysely_migration 6 → 7, reviews 2 → 2$/u),
  });

  expect(ctx.readBackups()).toStrictEqual([expect.stringMatching(/^store\.sqlite\.bak-0123456-\d{8}T\d{6}Z$/u)]);
  expect(fake.of('bun').map((call) => call.cmd.slice(2))).toStrictEqual([[`${paths.folder}/apps/cli/src/cli.ts`, 'store', 'query', 'findings-by-pr', '--repo', 'hq-pin-guard/none', '--pr', '1', '--json']]);
  expect(loadNoslopSettings(ctx.db).sha).toBe(FULL_SHA);
  expect(ctx.db.query("SELECT json_extract(data, '$.migrations') AS migrations FROM events WHERE action = 'pinned'").all()).toStrictEqual([{ migrations: '["0007-dispositions-by-pull-request"]' }]);
});

test('it refuses a pin when HQ_NOSLOP_STORE names a store noslop does not open, and runs nothing', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();
  onTestFinished(overrideEnv('HQ_NOSLOP_STORE', join(ctx.base, 'other-store.sqlite')));

  await expect(runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).rejects.toMatchObject({
    code: 'bad_args',
    message: expect.stringContaining(ctx.store),
  });

  expect(fake.calls).toStrictEqual([]);
});

test('it migrates the store noslop opens, when HQ_NOSLOP_STORE names that same file', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ storeQuery: buildStubStoreQuery(ctx.store, [ADD_0007]) }),
    paths = buildPinPaths(ctx.base);
  onTestFinished(overrideEnv('HQ_NOSLOP_STORE', ctx.store));
  createStubNoslopStore(ctx.store, { migrations: HELD_NAMES, tables: { dispositions: 3 } });
  createStubNoslopClone(paths.folder, NEW_NAMES);

  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' });

  expect(ctx.readBackups()).toHaveLength(1);
});

test('it refuses a pin when noslop starts during the install, removes the backup and keeps the old pin', async () => {
  const answers = [
      { code: 1, stdout: '', stderr: '' },
      { code: 0, stdout: '4242 bun /x/apps/cli/src/cli.ts review\n', stderr: '' },
    ],
    ctx = setupTest(),
    fake = buildFakeRunner({ storeQuery: buildStubStoreQuery(ctx.store, [ADD_0007]) }),
    paths = buildPinPaths(ctx.base),
    run: Runner = (cmd, opts) => (cmd[0] === 'pgrep' ? Promise.resolve(answers.shift() ?? BUSY) : fake.run(cmd, opts));
  createStubNoslopStore(ctx.store, { migrations: HELD_NAMES, tables: { dispositions: 3 } });
  createStubNoslopClone(paths.folder, NEW_NAMES);

  await expect(runNoslopCommand({ run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).rejects.toMatchObject({ code: 'noslop_busy', message: expect.stringContaining('4242') });

  expect(fake.of('bun')).toStrictEqual([]);
  expect(ctx.readBackups()).toStrictEqual([]);
  expect(loadNoslopSettings(ctx.db).sha).toBeNull();
});

test('it runs the store query from an empty folder, not from a repo', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ storeQuery: buildStubStoreQuery(ctx.store, [ADD_0007]) }),
    paths = buildPinPaths(ctx.base);
  createStubNoslopStore(ctx.store, { migrations: HELD_NAMES, tables: { dispositions: 1 } });
  createStubNoslopClone(paths.folder, NEW_NAMES);

  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' });

  expect(fake.of('bun').map((call) => call.cmd[1])).toStrictEqual([`--config=${paths.folder}/bunfig.toml`]);
  expect(fake.of('bun').map((call) => call.opts?.cwd?.startsWith(tmpdir()))).toStrictEqual([true]);
  expect(fake.of('bun').map((call) => existsSync(call.opts?.cwd ?? ''))).toStrictEqual([false]);
});

test('it refuses and keeps the old pin when a table loses rows in the migration, naming the backup', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ storeQuery: buildStubStoreQuery(ctx.store, [ADD_0007, 'DELETE FROM dispositions WHERE id > 1']) }),
    paths = buildPinPaths(ctx.base);
  createStubNoslopStore(ctx.store, { migrations: HELD_NAMES, tables: { dispositions: 3 } });
  createStubNoslopClone(paths.folder, NEW_NAMES);

  await expect(runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).rejects.toMatchObject({
    code: 'store_migration_failed',
    message: expect.stringMatching(/dispositions 3 -> 1[\s\S]*the backup is \S+store\.sqlite\.bak-0123456-\d{8}T\d{6}Z\./u),
  });

  expect(loadNoslopSettings(ctx.db).sha).toBeNull();
  expect(ctx.db.query("SELECT COUNT(*) AS n FROM events WHERE action = 'pinned'").get()).toStrictEqual({ n: 0 });
});

test('it refuses the next pin after a migration lost rows, naming the backup, while the store is not restored', async () => {
  const ctx = setupTest(),
    failures: unknown[] = [],
    fake = buildFakeRunner({ storeQuery: buildStubStoreQuery(ctx.store, [ADD_0007, 'DELETE FROM dispositions WHERE id > 1']) }),
    paths = buildPinPaths(ctx.base);
  createStubNoslopStore(ctx.store, { migrations: HELD_NAMES, tables: { dispositions: 3 } });
  createStubNoslopClone(paths.folder, NEW_NAMES);
  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' }).catch((error: unknown) => failures.push(error));

  await expect(runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).rejects.toMatchObject({
    code: 'store_migration_failed',
    message: expect.stringMatching(/0007-dispositions-by-pull-request[\s\S]*cp \S+store\.sqlite\.bak-0123456-\d{8}T\d{6}Z \S+store\.sqlite\. Every pin stays refused until then\.$/u),
    data: { backup: join(ctx.base, 'data', 'noslop', ctx.readBackups()[0] ?? 'none'), names: ['0007-dispositions-by-pull-request'] },
  });

  expect(failures).toMatchObject([{ code: 'store_migration_failed' }]);
  expect(ctx.readBackups()).toHaveLength(1);
  expect(fake.of('bun')).toHaveLength(1);
  expect(loadNoslopSettings(ctx.db).sha).toBeNull();
  expect(ctx.db.query("SELECT COUNT(*) AS n FROM events WHERE action = 'pinned'").get()).toStrictEqual({ n: 0 });
});

test('it pins again once the store is restored from the backup, migrating it anew', async () => {
  const ctx = setupTest(),
    failures: unknown[] = [],
    paths = buildPinPaths(ctx.base),
    restored = buildFakeRunner({ storeQuery: buildStubStoreQuery(ctx.store, [ADD_0007]) });
  createStubNoslopStore(ctx.store, { migrations: HELD_NAMES, tables: { dispositions: 3 } });
  createStubNoslopClone(paths.folder, NEW_NAMES);
  await runNoslopCommand({ run: buildFakeRunner({ storeQuery: buildStubStoreQuery(ctx.store, [ADD_0007, 'DELETE FROM dispositions WHERE id > 1']) }).run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' }).catch((error: unknown) => failures.push(error));
  renameSync(join(ctx.base, 'data', 'noslop', ctx.readBackups()[0] ?? 'none'), ctx.store);

  await expect(runNoslopCommand({ run: restored.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).resolves.toMatchObject({
    text: expect.stringContaining('store migration: 0007-dispositions-by-pull-request; backup'),
  });

  expect(failures).toMatchObject([{ code: 'store_migration_failed' }]);
  expect(restored.of('bun')).toHaveLength(1);
  expect(loadNoslopSettings(ctx.db).sha).toBe(FULL_SHA);
  expect(ctx.db.query("SELECT json_extract(data, '$.counts.dispositions.after') AS after FROM events WHERE action = 'pinned'").all()).toStrictEqual([{ after: 3 }]);
  expect(ctx.db.query("SELECT value FROM meta WHERE key = 'noslop_store_migration_failed'").all()).toStrictEqual([]);
});

test('it refuses the pin after a failed migration even with --force', async () => {
  const ctx = setupTest(),
    failures: unknown[] = [],
    fake = buildFakeRunner({ storeQuery: buildStubStoreQuery(ctx.store, [ADD_0007, 'DELETE FROM dispositions WHERE id > 1']) }),
    paths = buildPinPaths(ctx.base);
  createStubNoslopStore(ctx.store, { migrations: HELD_NAMES, tables: { dispositions: 3 } });
  createStubNoslopClone(paths.folder, NEW_NAMES);
  await runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' }).catch((error: unknown) => failures.push(error));

  await expect(runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456', 'invented', 'reason'], force: true, since: undefined, actor: 'tester' })).rejects.toMatchObject({
    code: 'store_migration_failed',
    message: expect.stringContaining('Every pin stays refused until then.'),
  });

  expect(failures).toMatchObject([{ code: 'store_migration_failed' }]);
  expect(loadNoslopSettings(ctx.db).sha).toBeNull();
});

test('it refuses and keeps the old pin when a migration name is missing after the run', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ storeQuery: buildStubStoreQuery(ctx.store, []) }),
    paths = buildPinPaths(ctx.base);
  createStubNoslopStore(ctx.store, { migrations: HELD_NAMES, tables: { dispositions: 3 } });
  createStubNoslopClone(paths.folder, NEW_NAMES);

  await expect(runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).rejects.toMatchObject({
    code: 'store_migration_failed',
    message: expect.stringContaining('0007-dispositions-by-pull-request'),
  });

  expect(loadNoslopSettings(ctx.db).sha).toBeNull();
});

test('it refuses when the store query fails', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner({ storeQuery: () => ({ code: 1, stdout: '', stderr: 'no such column' }) }),
    paths = buildPinPaths(ctx.base);
  createStubNoslopStore(ctx.store, { migrations: HELD_NAMES, tables: { dispositions: 3 } });
  createStubNoslopClone(paths.folder, NEW_NAMES);

  await expect(runNoslopCommand({ run: fake.run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).rejects.toMatchObject({
    code: 'store_migration_failed',
    message: expect.stringContaining('no such column'),
  });

  expect(loadNoslopSettings(ctx.db).sha).toBeNull();
});

test('it refuses when the migration names of the new noslop cannot be read', async () => {
  const ctx = setupTest(),
    paths = buildPinPaths(ctx.base);
  createStubNoslopStore(ctx.store, { migrations: HELD_NAMES, tables: { dispositions: 3 } });
  createStubNoslopClone(paths.folder, []);

  await expect(runNoslopCommand({ run: buildFakeRunner().run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).rejects.toMatchObject({ code: 'store_unreadable' });

  expect(loadNoslopSettings(ctx.db).sha).toBeNull();
  expect(ctx.readBackups()).toStrictEqual([]);
});

test('it refuses when the store holds no migration table', async () => {
  const ctx = setupTest(),
    paths = buildPinPaths(ctx.base);
  createStubNoslopClone(paths.folder, NEW_NAMES);
  createStubNoslopStore(ctx.store, { migrations: [], tables: { dispositions: 1 } });
  buildStubStoreQuery(ctx.store, ['DROP TABLE kysely_migration'])();

  await expect(runNoslopCommand({ run: buildFakeRunner().run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).rejects.toMatchObject({ code: 'store_unreadable' });

  expect(loadNoslopSettings(ctx.db).sha).toBeNull();
});

test('it pins with no backup when there is no store file', async () => {
  const ctx = setupTest(),
    paths = buildPinPaths(ctx.base);
  createStubNoslopClone(paths.folder, NEW_NAMES);

  await expect(runNoslopCommand({ run: buildFakeRunner().run, db: ctx.db, verb: 'pin', rest: ['0123456'], since: undefined, actor: 'tester' })).resolves.toMatchObject({
    text: `repos: none (noslop is off everywhere)\nemergency review cap: off everywhere (hq noslop cap <repo> <n>)\npinned: ${FULL_SHA}\nclone: ${paths.folder}\nno store migration (no store at ${ctx.store})`,
  });

  expect(existsSync(ctx.store)).toBe(false);
  expect(loadNoslopSettings(ctx.db).sha).toBe(FULL_SHA);
});

test('it reports the rounds as data and text', async () => {
  const ctx = setupTest();
  recordRound(ctx.db, {
    repo: 'widgets',
    pr: 7,
    kind: 'review',
    startedAt: '2026-10-18T01:00:00Z',
    endedAt: '2026-10-18T01:01:00Z',
    ms: 60_000,
    ok: true,
    head: null,
    base: null,
    depth: null,
    findings: [{ id: 'aaaaaaaaaaaaaaaa', lens: 'correctness', severity: 'high', title: 'Kettle never boils' }],
    failedCalls: 0,
    conclusion: null,
    open: [],
    error: null,
    sha: 'abc1234',
  });

  await expect(runNoslopCommand({ run: buildFakeRunner().run, db: ctx.db, verb: 'report', rest: [], since: '2026-10-18T00:00:00Z', actor: 'tester' })).resolves.toMatchObject({
    data: { reports: [{ ref: 'widgets#7', reviewsOk: 1, findings: 1, roundsWithNew: 1, late: { n: 0, of: 0 } }], totals: { prs: 1, roundsWithNew: 1, repeatClass: 0, classUnknown: 0, late: { n: 0, of: 0 }, lateUnknown: 0, mainMerge: 0, mergeUnknown: 1 } },
    text: expect.stringContaining('widgets#7\n  reviews: 1 ok, 0 failed (0 extra rounds)'),
  });
});

test('it refuses a verb it does not know', async () => {
  const ctx = setupTest();

  await expect(runNoslopCommand({ run: buildFakeRunner().run, db: ctx.db, verb: 'enable', rest: [], since: undefined, actor: 'tester' })).rejects.toMatchObject({ code: 'bad_args' });
});

test('it answers hq noslop on and hq noslop through the cli, as JSON', async () => {
  const ctx = setupTest(),
    lines: string[] = [],
    logger = spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });
  onTestFinished(() => logger.mockRestore());
  onTestFinished(overrideEnv('HQ_DB', join(ctx.base, 'cli.db')));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));

  await expect(main(['noslop', 'on', 'atc', '--json'])).resolves.toBe(0);
  await expect(main(['noslop', '--json'])).resolves.toBe(0);

  expect(lines.map((l) => JSON.parse(l))).toMatchObject([{ ok: true, repos: ['atc'], sha: null }, { ok: true, repos: ['atc'], sha: null }]);
});

test('it pins through hq noslop pin --force on the cli while noslop runs, and records the reason', async () => {
  const ctx = setupTest(),
    db = new Database(join(ctx.base, 'cli.db'), { create: true }),
    fake = buildFakeRunner({ pgrep: { code: 0, stdout: '4242 bun /x/apps/cli/src/cli.ts review --pr 7\n', stderr: '' } }),
    lines: string[] = [],
    logger = spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });
  onTestFinished(() => db.close());
  onTestFinished(() => logger.mockRestore());
  onTestFinished(overrideEnv('HQ_DB', join(ctx.base, 'cli.db')));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));

  await expect(main(['noslop', 'pin', '0123456', '--force', 'invented', 'reason', '--json'], fake.run)).resolves.toBe(0);

  expect(JSON.parse(lines[0] ?? '')).toMatchObject({ ok: true, sha: FULL_SHA });
  expect(db.query("SELECT json_extract(data, '$.force') AS force FROM events WHERE action = 'pinned'").all()).toStrictEqual([{ force: 'invented reason' }]);
});

test('it refuses hq noslop pin --force with no reason on the cli as bad_args', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    lines: string[] = [],
    logger = spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });
  onTestFinished(() => logger.mockRestore());
  onTestFinished(overrideEnv('HQ_DB', join(ctx.base, 'cli.db')));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));

  await expect(main(['noslop', 'pin', '0123456', '--force', '--json'], fake.run)).resolves.toBe(1);

  expect(JSON.parse(lines[0] ?? '')).toMatchObject({ ok: false, error: { code: 'bad_args', message: expect.stringContaining('needs a reason') } });
  expect(fake.calls).toStrictEqual([]);
});

test('it lets a PR of a repo off the list merge through hq review gate, with exit 0', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    lines: string[] = [],
    logger = spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });
  onTestFinished(() => logger.mockRestore());
  onTestFinished(overrideEnv('HQ_DB', join(ctx.base, 'cli.db')));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));

  await expect(main(['review', 'gate', 'widgets', '7', '--json'], fake.run)).resolves.toBe(0);

  expect(JSON.parse(lines[0] ?? '')).toMatchObject({ ok: true, mayMerge: true, reason: 'not a noslop repo: green CI is enough' });
});

test('it records gate none on the PR record through hq review gate for a PR of a repo off the list', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    db = new Database(join(ctx.base, 'cli.db'), { create: true }),
    logger = spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(() => db.close());
  onTestFinished(() => logger.mockRestore());
  onTestFinished(overrideEnv('HQ_DB', join(ctx.base, 'cli.db')));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));

  await expect(main(['review', 'gate', 'widgets', '7', '--json'], fake.run)).resolves.toBe(0);

  expect(db.query('SELECT repo, pr, head, gate, gate_head FROM pr_status').all()).toStrictEqual([{ repo: 'widgets', pr: 7, head: null, gate: 'none', gate_head: null }]);
});

test('it parses --full on hq review and refuses it for a PR on Codex', async () => {
  const ctx = setupTest(),
    lines: string[] = [],
    logger = spyOn(console, 'log').mockImplementation((line: string) => {
      lines.push(line);
    });
  onTestFinished(() => logger.mockRestore());
  onTestFinished(overrideEnv('HQ_DB', join(ctx.base, 'cli.db')));
  onTestFinished(overrideEnv('HQ_NOTIFY', 'off'));
  onTestFinished(overrideEnv('REVIEW_DIR', ctx.base));

  await expect(main(['review', 'widgets', '7', '--full', '--json'])).resolves.not.toBe(0);

  expect(JSON.parse(lines[0] ?? '')).toMatchObject({ ok: false, error: { code: 'bad_args' } });
});
