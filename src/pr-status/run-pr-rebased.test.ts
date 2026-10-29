import { expect, onTestFinished, test } from 'bun:test';
import { buildStubPRHead } from '../../test/build-stub-pr-head.ts';
import { createStubRebaseRepo } from '../../test/create-stub-rebase-repo.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { buildFakeRunner } from '../../test/noslop-fake.ts';
import type { Runner } from '../runner/types.ts';
import { overrideEnv } from '../config/override-env.ts';
import { listNews } from '../news/list-news.ts';
import { readHeadLgtm } from './read-head-lgtm.ts';
import { recordPRAnswer } from './record-pr-answer.ts';
import { runPRCommand } from './run-pr-command.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_PROJECTS', `${fresh.dir}/projects`));
  onTestFinished(overrideEnv('HQ_REPOS', `${fresh.dir}/repos`));
  return { db: fresh.db, root: fresh.dir };
}

const BODY = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'].map((word) => `${word}\n`).join('');

const EDITED = BODY.replace('five\n', 'fifty\n');

type Setup = ReturnType<typeof setupTest>;

// A repo whose PR changes line five of notes.txt and one more file, plus the owner's chat lgtm at that head.
async function setupPR(ctx: Setup, repo = 'widgets') {
  const stub = await createStubRebaseRepo({ root: ctx.root, repo, pr: 7, history: [{ 'notes.txt': BODY, 'other.txt': 'plain\n' }], change: { 'notes.txt': EDITED, 'extra.txt': 'extra\n' } });
  recordPRAnswer(ctx.db, { repo, pr: 7, answer: 'lgtm', head: stub.oldHead, source: 'chat:kettle-1@ward', note: 'the kettle edit reads well', actor: 'z-kettle' });
  return stub;
}

interface Call {
  ctx: Setup;
  repo?: string;
  head: string;
  from?: string | undefined;
  actor?: string;
  probe?: 'match' | 'other';
}

async function runRebased(call: Call) {
  const fake = buildFakeRunner({ realGit: true, ...buildStubPRHead(call.head) });
  // The fake names zgeoff/widgets as every origin; this repo's is its own.
  const run: Runner = (cmd, opts) => (cmd.join(' ') === 'git remote get-url origin' ? Promise.resolve({ code: 0, stdout: `git@github.com:zgeoff/${call.repo ?? 'widgets'}.git\n`, stderr: '' }) : fake.run(cmd, opts));
  const from = 'from' in call ? call.from : undefined;
  return await runPRCommand({
    run,
    db: call.ctx.db,
    verb: 'rebased',
    rest: [call.repo ?? 'widgets', '7'],
    flags: from === undefined ? {} : { from },
    actor: () => Promise.resolve(call.actor ?? 'z-review'),
    readOwnerSession: () => Promise.resolve({ verdict: 'other' }),
    readReviewerSession: () => Promise.resolve({ verdict: call.probe ?? 'match' }),
  });
}

async function runStatus(ctx: Setup, head: string) {
  const fake = buildFakeRunner({ realGit: true, ...buildStubPRHead(head) });
  return await runPRCommand({ run: fake.run, db: ctx.db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });
}

test('it carries the lgtm over a clean rebase onto a moved main, with the original source and note', async () => {
  const ctx = setupTest();
  const stub = await setupPR(ctx);
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();

  const out = await runRebased({ ctx, head, from: stub.oldHead.slice(0, 9) });

  const carried = readHeadLgtm(ctx.db, 'widgets', 7, head);
  expect(carried).toMatchObject({ answer: 'lgtm', head, source: `rebased:${stub.oldHead}` });
  expect(carried?.note).toStartWith('from chat:kettle-1@ward: the kettle edit reads well; patch-id ');
  expect(out.data).toMatchObject({ rebased: { repo: 'widgets', pr: 7, from: stub.oldHead, head, source: `rebased:${stub.oldHead}`, carried: { source: 'chat:kettle-1@ward', note: 'the kettle edit reads well' } } });
  expect(listNews(ctx.db, { all: true, limit: 10 })).toMatchObject([{ from_name: 'z-review', topic: 'merge', text: `z-review carried the owner's lgtm on widgets#7 from ${stub.oldHead.slice(0, 7)} to ${head.slice(0, 7)}: git's patch-id of the diff matched` }]);
  expect(ctx.db.query("SELECT count(*) AS n FROM events WHERE action = 'pr-answer'").get()).toStrictEqual({ n: 2 });
});

test('it shows the carried lgtm in hq pr status with the source it carries, not stale', async () => {
  const ctx = setupTest();
  const stub = await setupPR(ctx);
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();
  await runRebased({ ctx, head, from: stub.oldHead });

  const status = await runStatus(ctx, head);

  expect(status.text).toMatch(new RegExp(`answer: lgtm at ${head.slice(0, 7)} via rebased:${stub.oldHead.slice(0, 7)} \\(from chat:kettle-1@ward: the kettle edit reads well; patch-id [0-9a-f]{40}\\) \\(`, 'u'));
});

test('it refuses a rebase that changes a content line, names the file and records nothing', async () => {
  const ctx = setupTest();
  const stub = await setupPR(ctx);
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase({ 'extra.txt': 'extra, edited\n' });

  await expect(runRebased({ ctx, head, from: stub.oldHead })).rejects.toMatchObject({ code: 'not_carried', message: expect.stringContaining('changed: extra.txt)') });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([]);
});

test('it refuses a base move that changes a context line inside the hunk of the PR', async () => {
  const ctx = setupTest();
  const stub = await setupPR(ctx);
  await stub.moveMain({ 'notes.txt': BODY.replace('three\n', 'third\n') });
  const head = await stub.rebase();

  await expect(runRebased({ ctx, head, from: stub.oldHead })).rejects.toMatchObject({ code: 'not_carried', message: expect.stringContaining('changed: notes.txt)') });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
});

test('it lists the first ten changed files and counts the rest', async () => {
  const ctx = setupTest();
  const names = Array.from({ length: 12 }, (_unused, index) => `part-${String(index).padStart(2, '0')}.txt`);
  const stub = await createStubRebaseRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'a.txt': 'one\n' }], change: Object.fromEntries(names.map((name) => [name, 'plain\n'])) });
  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head: stub.oldHead, source: 'chat:kettle-1', note: null, actor: 'z-kettle' });
  const head = await stub.rebase(Object.fromEntries(names.map((name) => [name, 'edited\n'])));

  await expect(runRebased({ ctx, head, from: stub.oldHead })).rejects.toMatchObject({ message: expect.stringContaining(`changed: ${names.slice(0, 10).join(', ')} and 2 more)`) });
});

test('it carries the lgtm over a squash of the same content', async () => {
  const ctx = setupTest();
  const stub = await setupPR(ctx);
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.squash();

  await runRebased({ ctx, head, from: stub.oldHead });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toMatchObject({ source: `rebased:${stub.oldHead}` });
});

test('it refuses when a later changes at the old head took the lgtm back', async () => {
  const ctx = setupTest();
  const stub = await setupPR(ctx);
  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'changes', head: stub.oldHead, source: 'chat:kettle-1', note: 'rename the kettle', actor: 'z-kettle' });
  const head = await stub.rebase();

  await expect(runRebased({ ctx, head, from: stub.oldHead })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('is not the newest answer') });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
});

test('it refuses a head with no answer', async () => {
  const ctx = setupTest();
  const stub = await createStubRebaseRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'a.txt': 'one\n' }], change: { 'b.txt': 'two\n' } });
  const head = await stub.rebase();

  await expect(runRebased({ ctx, head, from: stub.oldHead })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('no answer is recorded') });
});

test('it refuses when the head has not moved', async () => {
  const ctx = setupTest();
  const stub = await setupPR(ctx);

  await expect(runRebased({ ctx, head: stub.oldHead, from: stub.oldHead })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('nothing to carry') });
});

test('it refuses an actor that is not z-review', async () => {
  const ctx = setupTest();
  const stub = await setupPR(ctx);
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();

  await expect(runRebased({ ctx, head, from: stub.oldHead, actor: 'z-kettle' })).rejects.toMatchObject({ code: 'bad_args', message: 'only z-review records this, not z-kettle' });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
});

test("it refuses a session that is not z-review's own", async () => {
  const ctx = setupTest();
  const stub = await setupPR(ctx);
  const head = await stub.rebase();

  await expect(runRebased({ ctx, head, from: stub.oldHead, probe: 'other' })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining("only z-review's own atc session") });
});

test.each([undefined, 'xyz', 'abc12'])('it refuses --from %p', async (from) => {
  const ctx = setupTest();
  const stub = await setupPR(ctx);
  const head = await stub.rebase();

  await expect(runRebased({ ctx, head, from })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('usage: hq pr rebased') });
});

test('it refuses a diff git cannot read at the old head', async () => {
  const ctx = setupTest();
  const stub = await setupPR(ctx);
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();
  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed', source: 'chat:kettle-1', note: null, actor: 'z-kettle' });

  await expect(runRebased({ ctx, head, from: 'f00dfeed' })).rejects.toMatchObject({ code: 'git_unreadable' });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
});

test('it refuses a typed rebased: source on hq pr answer', async () => {
  const ctx = setupTest();
  const stub = await setupPR(ctx);
  const fake = buildFakeRunner({ realGit: true, ...buildStubPRHead(stub.oldHead) });

  await expect(runPRCommand({ run: fake.run, db: ctx.db, verb: 'answer', rest: ['widgets', '7', 'lgtm'], flags: { source: `rebased:${stub.oldHead}` }, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('must be chat:<id>') });
});

test.each(['hq', 'hq-private'])('it works for %s, which has no instruction-file hold, on a PR with no instruction file', async (repo) => {
  const ctx = setupTest();
  const stub = await setupPR(ctx, repo);
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();

  await runRebased({ ctx, repo, head, from: stub.oldHead });

  expect(readHeadLgtm(ctx.db, repo, 7, head)).toMatchObject({ source: `rebased:${stub.oldHead}` });
});
