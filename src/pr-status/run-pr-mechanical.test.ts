import { expect, onTestFinished, test } from 'bun:test';
import { createStubPRRepo } from '../../test/create-stub-pr-repo.ts';
import { buildStubPRHead } from '../../test/build-stub-pr-head.ts';
import { buildFakeRunner } from '../../test/noslop-fake.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { overrideEnv } from '../config/override-env.ts';
import { listNews } from '../news/list-news.ts';
import { readHeadLgtm } from './read-head-lgtm.ts';
import { runPRCommand } from './run-pr-command.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_PROJECTS', `${fresh.dir}/projects`));
  onTestFinished(overrideEnv('HQ_REPOS', `${fresh.dir}/repos`));
  return {
    db: fresh.db,
    root: fresh.dir,
  };
}

test('it records a mechanical edit that hq proves, with one news line', async () => {
  const ctx = setupTest();
  const stub = await createStubPRRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'AGENTS.md': 'Needs bun 1.3.4.\n' }], change: { 'AGENTS.md': 'Needs bun 1.4.0.\n' } });
  const fake = buildFakeRunner({ realGit: true, prFiles: { code: 0, stdout: 'AGENTS.md\n', stderr: '' }, ...buildStubPRHead(stub.head) });

  const out = await runPRCommand({ run: fake.run, db: ctx.db, verb: 'mechanical', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(out.data).toStrictEqual({ mechanical: { repo: 'widgets', pr: 7, head: stub.head, files: ['AGENTS.md'], lines: 1 } });
  expect(listNews(ctx.db, { all: true, limit: 10 })).toMatchObject([{ from_name: 'z-review', topic: 'merge', text: `z-review approved mechanical skill edits on widgets#7 at ${stub.head.slice(0, 7)}: AGENTS.md (1 lines)` }]);
});

test('it records no owner answer, so the owner lines of the record stay empty', async () => {
  const ctx = setupTest();
  const stub = await createStubPRRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'AGENTS.md': 'Needs bun 1.3.4.\n' }], change: { 'AGENTS.md': 'Needs bun 1.4.0.\n' } });
  const fake = buildFakeRunner({ realGit: true, prFiles: { code: 0, stdout: 'AGENTS.md\n', stderr: '' }, ...buildStubPRHead(stub.head) });

  await runPRCommand({ run: fake.run, db: ctx.db, verb: 'mechanical', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, stub.head)).toBeNull();
});

test('it shows the record on its own line of hq pr status', async () => {
  const ctx = setupTest();
  const stub = await createStubPRRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'AGENTS.md': 'Needs bun 1.3.4.\n' }], change: { 'AGENTS.md': 'Needs bun 1.4.0.\n' } });
  const fake = buildFakeRunner({ realGit: true, prFiles: { code: 0, stdout: 'AGENTS.md\n', stderr: '' }, ...buildStubPRHead(stub.head) });
  await runPRCommand({ run: fake.run, db: ctx.db, verb: 'mechanical', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });
  await runPRCommand({ run: fake.run, db: ctx.db, verb: 'next', rest: ['widgets', '7', 'z-review'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  const status = await runPRCommand({ run: fake.run, db: ctx.db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(status.text).toContain('z-review: mechanical edits proved by hq (1 lines in AGENTS.md)');
  expect(status.text).toContain('answer: none');
});

test('it shows the record in hq pr status for a fresh PR with no other record', async () => {
  const ctx = setupTest();
  const stub = await createStubPRRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'AGENTS.md': 'Needs bun 1.3.4.\n' }], change: { 'AGENTS.md': 'Needs bun 1.4.0.\n' } });
  const fake = buildFakeRunner({ realGit: true, prFiles: { code: 0, stdout: 'AGENTS.md\n', stderr: '' }, ...buildStubPRHead(stub.head) });
  await runPRCommand({ run: fake.run, db: ctx.db, verb: 'mechanical', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  const status = await runPRCommand({ run: fake.run, db: ctx.db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(status).toStrictEqual({
    data: { pr: null, reviewRecords: { mechanical: { files: ['AGENTS.md'], lines: 1 }, exemption: null } },
    text: 'No record for widgets#7.\nz-review: mechanical edits proved by hq (1 lines in AGENTS.md)',
  });
});

test('it counts three long held paths in a news line that fits, and records them all', async () => {
  const ctx = setupTest();
  const paths = ['a', 'b', 'c'].map((letter) => `skills/${letter.repeat(104)}/SKILL.md`);
  const stub = await createStubPRRepo({
    root: ctx.root,
    repo: 'widgets',
    pr: 7,
    history: [Object.fromEntries(paths.map((path) => [path, 'Needs bun 1.3.4.\n']))],
    change: Object.fromEntries(paths.map((path) => [path, 'Needs bun 1.4.0.\n'])),
  });
  const fake = buildFakeRunner({ realGit: true, prFiles: { code: 0, stdout: `${paths.join('\n')}\n`, stderr: '' }, ...buildStubPRHead(stub.head) });

  const out = await runPRCommand({ run: fake.run, db: ctx.db, verb: 'mechanical', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(paths.map((path) => path.length)).toStrictEqual([120, 120, 120]);
  expect(out.data).toStrictEqual({ mechanical: { repo: 'widgets', pr: 7, head: stub.head, files: paths, lines: 3 } });
  expect(listNews(ctx.db, { all: true, limit: 10 }).map((item) => item.text)).toStrictEqual([`z-review approved mechanical skill edits on widgets#7 at ${stub.head.slice(0, 7)}: 3 held files, all listed by hq pr status widgets 7 (3 lines)`]);
});

test('it refuses an edit hq does not prove, names the line, and records nothing', async () => {
  const ctx = setupTest();
  const stub = await createStubPRRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'AGENTS.md': 'Boil the water.\nPour.\n' }], change: { 'AGENTS.md': 'Boil the water.\nSteam.\n' } });
  const fake = buildFakeRunner({ realGit: true, prFiles: { code: 0, stdout: 'AGENTS.md\n', stderr: '' }, ...buildStubPRHead(stub.head) });

  await expect(runPRCommand({ run: fake.run, db: ctx.db, verb: 'mechanical', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({ code: 'not_mechanical', message: expect.stringContaining('AGENTS.md line 2: the words of the line changed') });

  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([]);
  expect(ctx.db.query("SELECT 1 FROM events WHERE action = 'pr-mechanical'").get()).toBeNull();
});

test('it refuses any actor but z-review', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'AGENTS.md\n', stderr: '' } });

  await expect(runPRCommand({ run: fake.run, db: ctx.db, verb: 'mechanical', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({ code: 'bad_args', message: 'only z-review records this, not z-kettle' });
});

test('it refuses a session that is not z-review even when the actor says z-review, and records nothing', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'AGENTS.md\n', stderr: '' } });

  await expect(runPRCommand({ run: fake.run, db: ctx.db, verb: 'mechanical', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'other' }) })).rejects.toMatchObject({ code: 'bad_args', message: "only z-review's own atc session records this; this session is not it" });

  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([]);
});

test.each(['hq', 'hq-private'])('it refuses a PR in %s, whose held paths need the owner\'s lgtm', async (repo) => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'skills/kettle/SKILL.md\n', stderr: '' } });

  await expect(runPRCommand({ run: fake.run, db: ctx.db, verb: 'mechanical', rest: [repo, '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('need the owner\'s lgtm') });
});

test('it refuses a PR that changes no instruction file', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'src/kettle.ts\n', stderr: '' } });

  await expect(runPRCommand({ run: fake.run, db: ctx.db, verb: 'mechanical', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({ code: 'bad_args', message: 'zgeoff/widgets#7 changes no repo instruction file, so there is nothing to record' });
});

test('it refuses to record when the head is unreadable', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner({ prFiles: { code: 0, stdout: 'AGENTS.md\n', stderr: '' }, prHead: { code: 1, stdout: '', stderr: 'gh: down' } });

  await expect(runPRCommand({ run: fake.run, db: ctx.db, verb: 'mechanical', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({ code: 'head_unreadable' });
});

test('it refuses to record when hq cannot read the diff at the head', async () => {
  const ctx = setupTest();
  await createStubPRRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'AGENTS.md': 'Needs bun 1.3.4.\n' }], change: { 'AGENTS.md': 'Needs bun 1.4.0.\n' } });
  const fake = buildFakeRunner({ realGit: true, prFiles: { code: 0, stdout: 'AGENTS.md\n', stderr: '' }, ...buildStubPRHead('f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed') });

  await expect(runPRCommand({ run: fake.run, db: ctx.db, verb: 'mechanical', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({ code: 'git_unreadable', message: expect.stringContaining('could not read the diff') });

  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([]);
});
