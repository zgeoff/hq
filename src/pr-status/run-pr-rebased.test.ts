import { expect, onTestFinished, test } from 'bun:test';
import { buildStubPRHead } from '../../test/build-stub-pr-head.ts';
import { createStubRebaseRepo } from '../../test/create-stub-rebase-repo.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { FAKE_BASE_SHA, buildFakeRunner } from '../../test/noslop-fake.ts';
import { realRunner } from '../runner/real-runner.ts';
import type { RunResult, Runner } from '../runner/types.ts';
import { overrideEnv } from '../config/override-env.ts';
import { logEvent } from '../log-event.ts';
import { listNews } from '../news/list-news.ts';
import { readHeadLgtm } from './read-head-lgtm.ts';
import { recordPRAnswer } from './record-pr-answer.ts';
import { runPRCommand } from './run-pr-command.ts';

interface Call {
  head: string;

  // The base branch's tip GitHub names; a sha no checkout holds when absent.
  base?: string;
  repo?: string;
  from?: string | undefined;
  actor?: string;
  probe?: 'match' | 'other';

  // Runs when hq reads the new head's merge base, as the owner answering during the slow git work.
  during?: () => void;

  // Replaces what a gh call answers, keyed by a piece of its command line.
  gh?: Record<string, RunResult>;
}

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  onTestFinished(overrideEnv('HQ_PROJECTS', `${fresh.dir}/projects`));
  onTestFinished(overrideEnv('HQ_REPOS', `${fresh.dir}/repos`));
  const body = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'].map((word) => `${word}\n`).join('');
  const edited = body.replace('five\n', 'fifty\n');
  const db = fresh.db;

  // A repo whose PR changes line five of notes.txt and one more file, plus the owner's chat lgtm at that head.
  const setupPR = async (repo = 'widgets') => {
    const stub = await createStubRebaseRepo({ root: fresh.dir, repo, pr: 7, history: [{ 'notes.txt': body, 'other.txt': 'plain\n' }], change: { 'notes.txt': edited, 'extra.txt': 'extra\n' } });
    recordPRAnswer(db, { repo, pr: 7, answer: 'lgtm', head: stub.oldHead, source: 'chat:kettle-1@ward', note: 'the kettle edit reads well', actor: 'z-kettle' });
    return stub;
  };
  const runRebased = async (call: Call) => {
    const repo = call.repo ?? 'widgets';
    const base = call.base ?? FAKE_BASE_SHA;
    const fake = buildFakeRunner({ realGit: true, ...buildStubPRHead(call.head), prShas: { code: 0, stdout: JSON.stringify({ headRefOid: call.head, baseRefOid: base }), stderr: '' } });
    const run: Runner = (cmd, opts) => {
      const line = cmd.join(' ');
      const answer = Object.entries(call.gh ?? {}).find(([piece]) => line.includes(piece))?.[1];
      if (answer !== undefined) {
        return Promise.resolve(answer);
      }
      if (line === 'git remote get-url origin') {
        // The fake names zgeoff/widgets as every origin; this repo's is its own.
        return Promise.resolve({ code: 0, stdout: `git@github.com:zgeoff/${repo}.git\n`, stderr: '' });
      }
      if (line === `git merge-base ${base} ${call.head}`) {
        call.during?.();
      }
      return fake.run(cmd, opts);
    };
    const from = 'from' in call ? call.from : undefined;
    return await runPRCommand({
      run,
      db,
      verb: 'rebased',
      rest: [repo, '7'],
      flags: from === undefined ? {} : { from },
      actor: () => Promise.resolve(call.actor ?? 'z-review'),
      readOwnerSession: () => Promise.resolve({ verdict: 'other' }),
      readReviewerSession: () => Promise.resolve({ verdict: call.probe ?? 'match' }),
    });
  };
  const runStatus = async (head: string) => {
    const fake = buildFakeRunner({ realGit: true, ...buildStubPRHead(head) });
    return await runPRCommand({ run: fake.run, db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });
  };
  return { db, root: fresh.dir, body, edited, setupPR, runRebased, runStatus };
}

test('it carries the lgtm over a clean rebase onto a moved main, with the original source and note', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();

  const out = await ctx.runRebased({ head, base: await stub.readMainHead(), from: stub.oldHead.slice(0, 9) });

  const carried = readHeadLgtm(ctx.db, 'widgets', 7, head);
  expect(carried).toMatchObject({ answer: 'lgtm', head, source: `rebased:${stub.oldHead}` });
  expect(carried?.note).toStartWith('from chat:kettle-1@ward: the kettle edit reads well; patch-id ');
  expect(out.data).toMatchObject({ rebased: { repo: 'widgets', pr: 7, from: stub.oldHead, head, source: `rebased:${stub.oldHead}`, carried: { source: 'chat:kettle-1@ward', note: 'the kettle edit reads well' } } });
  expect(listNews(ctx.db, { all: true, limit: 10 })).toMatchObject([{ from_name: 'z-review', topic: 'merge', text: `z-review carried the owner's lgtm on widgets#7 from ${stub.oldHead.slice(0, 7)} to ${head.slice(0, 7)}: git's patch-id of the diff matched` }]);
  expect(ctx.db.query("SELECT count(*) AS total FROM events WHERE action = 'pr-answer'").get()).toStrictEqual({ total: 2 });
});

test('it shows the carried lgtm in hq pr status with the source it carries, not stale', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();
  await ctx.runRebased({ head, base: await stub.readMainHead(), from: stub.oldHead });

  const status = await ctx.runStatus(head);

  expect(status.text).toMatch(new RegExp(`answer: lgtm at ${head.slice(0, 7)} via rebased:${stub.oldHead.slice(0, 7)} \\(from chat:kettle-1@ward: the kettle edit reads well; patch-id [0-9a-f]{40}\\) \\(`, 'u'));
});

test('it refuses a rebase that changes a content line, names the file and records nothing', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase({ 'extra.txt': 'extra, edited\n' });

  await expect(ctx.runRebased({ head, base: await stub.readMainHead(), from: stub.oldHead })).rejects.toMatchObject({ code: 'not_carried', message: expect.stringContaining('changed: extra.txt)') });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([]);
});

test('it refuses a base move that changes a context line inside the hunk of the PR', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'notes.txt': ctx.body.replace('three\n', 'third\n') });
  const head = await stub.rebase();

  await expect(ctx.runRebased({ head, base: await stub.readMainHead(), from: stub.oldHead })).rejects.toMatchObject({ code: 'not_carried', message: expect.stringContaining('changed: notes.txt)') });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
});

test('it lists the first ten changed files and counts the rest', async () => {
  const ctx = setupTest();
  const names = Array.from({ length: 12 }, (_unused, index) => `part-${String(index).padStart(2, '0')}.txt`);
  const stub = await createStubRebaseRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'a.txt': 'one\n' }], change: Object.fromEntries(names.map((name) => [name, 'plain\n'])) });
  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head: stub.oldHead, source: 'chat:kettle-1', note: null, actor: 'z-kettle' });
  const head = await stub.rebase(Object.fromEntries(names.map((name) => [name, 'edited\n'])));

  await expect(ctx.runRebased({ head, base: await stub.readMainHead(), from: stub.oldHead })).rejects.toMatchObject({ message: expect.stringContaining(`changed: ${names.slice(0, 10).join(', ')} and 2 more)`) });
});

test('it carries the lgtm over a squash of a two-commit PR into one commit of the same content', async () => {
  const ctx = setupTest();
  const stub = await createStubRebaseRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'notes.txt': ctx.body, 'other.txt': 'plain\n' }], change: { 'notes.txt': ctx.edited }, followUp: { 'extra.txt': 'extra\n' } });
  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head: stub.oldHead, source: 'chat:kettle-1@ward', note: 'the kettle edit reads well', actor: 'z-kettle' });
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.squash();

  await ctx.runRebased({ head, base: await stub.readMainHead(), from: stub.oldHead });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toMatchObject({ source: `rebased:${stub.oldHead}` });
});

test("it carries an lgtm a second time with the owner's own source and note, not the first carry's", async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const first = await stub.rebase();
  await ctx.runRebased({ head: first, base: await stub.readMainHead(), from: stub.oldHead });
  await stub.moveMain({ 'other.txt': 'plain and moved again\n' });
  const second = await stub.rebase();

  const out = await ctx.runRebased({ head: second, base: await stub.readMainHead(), from: first });

  const carried = readHeadLgtm(ctx.db, 'widgets', 7, second);
  expect(carried?.source).toBe(`rebased:${first}`);
  expect(carried?.note).toMatch(/^from chat:kettle-1@ward: the kettle edit reads well; patch-id [0-9a-f]{40}$/u);
  expect(out.data).toMatchObject({ rebased: { from: first, head: second, carried: { source: 'chat:kettle-1@ward', note: 'the kettle edit reads well' } } });
});

test('it leaves no ref of its own in the checkout', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();
  const refsBefore = await realRunner(['git', 'for-each-ref', '--format=%(refname)'], { cwd: stub.directory });

  await ctx.runRebased({ head, base: await stub.readMainHead(), from: stub.oldHead });

  const refsAfter = await realRunner(['git', 'for-each-ref', '--format=%(refname)'], { cwd: stub.directory });
  expect(refsAfter.stdout).toBe(refsBefore.stdout);
});

test('it refuses when a later changes at the old head took the lgtm back', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'changes', head: stub.oldHead, source: 'chat:kettle-1', note: 'rename the kettle', actor: 'z-kettle' });
  const head = await stub.rebase();

  await expect(ctx.runRebased({ head, from: stub.oldHead })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('is not the newest answer') });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
});

test('it refuses a head with no answer', async () => {
  const ctx = setupTest();
  const stub = await createStubRebaseRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'a.txt': 'one\n' }], change: { 'b.txt': 'two\n' } });
  const head = await stub.rebase();

  await expect(ctx.runRebased({ head, from: stub.oldHead })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('no answer is recorded') });
});

test('it refuses when the head has not moved', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();

  await expect(ctx.runRebased({ head: stub.oldHead, from: stub.oldHead })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('nothing to carry') });
});

test('it refuses an actor that is not z-review', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();

  await expect(ctx.runRebased({ head, from: stub.oldHead, actor: 'z-kettle' })).rejects.toMatchObject({ code: 'bad_args', message: 'only z-review records this, not z-kettle' });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
});

test("it refuses a session that is not z-review's own", async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  const head = await stub.rebase();

  await expect(ctx.runRebased({ head, from: stub.oldHead, probe: 'other' })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining("only z-review's own atc session") });
});

test.each([undefined, 'xyz', 'abc12'])('it refuses --from %p', async (from) => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  const head = await stub.rebase();

  await expect(ctx.runRebased({ head, from })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('usage: hq pr rebased') });
});

test('it refuses an old head that git cannot fetch', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();
  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed', source: 'chat:kettle-1', note: null, actor: 'z-kettle' });

  await expect(ctx.runRebased({ head, base: await stub.readMainHead(), from: 'f00dfeed' })).rejects.toMatchObject({ code: 'git_unreadable' });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
});

test('it refuses a typed rebased: source on hq pr answer', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  const fake = buildFakeRunner({ realGit: true, ...buildStubPRHead(stub.oldHead) });

  await expect(runPRCommand({ run: fake.run, db: ctx.db, verb: 'answer', rest: ['widgets', '7', 'lgtm'], flags: { source: `rebased:${stub.oldHead}` }, actor: () => Promise.resolve('z-review'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('must be chat:<id>') });
});

test.each(['hq', 'hq-private'])('it works for %s, which has no instruction-file hold, on a PR with no instruction file', async (repo) => {
  const ctx = setupTest();
  const stub = await ctx.setupPR(repo);
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();

  await ctx.runRebased({ repo, head, base: await stub.readMainHead(), from: stub.oldHead });

  expect(readHeadLgtm(ctx.db, repo, 7, head)).toMatchObject({ source: `rebased:${stub.oldHead}` });
});

test('it refuses when the owner answered changes at the new head first', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();
  recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'changes', head, source: 'chat:kettle-1', note: 'rename the kettle', actor: 'z-kettle' });

  await expect(ctx.runRebased({ head, base: await stub.readMainHead(), from: stub.oldHead })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('already answered changes at') });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([]);
});

test('it refuses when the owner answers changes at the old head during the git work', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();
  const during = () => recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'changes', head: stub.oldHead, source: 'chat:kettle-1', note: 'rename the kettle', actor: 'z-kettle' });

  await expect(ctx.runRebased({ head, base: await stub.readMainHead(), from: stub.oldHead, during })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('no longer the newest answer') });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
  expect(listNews(ctx.db, { all: true, limit: 10 })).toStrictEqual([]);
});

test('it refuses when the owner answers reject at the new head during the git work', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();
  const during = () => recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'reject', head, source: 'chat:kettle-1', note: 'no kettles', actor: 'z-kettle' });

  await expect(ctx.runRebased({ head, base: await stub.readMainHead(), from: stub.oldHead, during })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('already answered reject at') });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
});

test('it refuses a --from prefix that fits two heads with answers', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  const head = await stub.rebase();
  for (const filler of ['1', '2']) {
    recordPRAnswer(ctx.db, { repo: 'widgets', pr: 7, answer: 'lgtm', head: `abc1234${filler.repeat(33)}`, source: 'chat:kettle-1', note: null, actor: 'z-kettle' });
  }

  await expect(ctx.runRebased({ head, from: 'abc1234' })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('fits 2 heads with answers') });
});

test('it refuses when gh cannot read the head', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();

  await expect(ctx.runRebased({ head, from: stub.oldHead, gh: { 'headRefOid': { code: 1, stdout: '', stderr: 'no route' } } })).rejects.toMatchObject({ code: 'head_unreadable' });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
});

test('it refuses when an answer record cannot be read', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();
  logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-answer', 'z-kettle', null, null, { answer: 'maybe' });

  await expect(ctx.runRebased({ head, from: stub.oldHead })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('cannot be read') });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
});

test('it refuses when gh gives no base sha', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();

  await expect(ctx.runRebased({ head, from: stub.oldHead, gh: { 'headRefOid,baseRefOid': { code: 0, stdout: JSON.stringify({ headRefOid: head }), stderr: '' } } })).rejects.toMatchObject({ code: 'head_unreadable', message: expect.stringContaining("could not read zgeoff/widgets#7's head and base with gh") });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
});

test('it refuses when hq has no checkout of the repo', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'other.txt': 'plain and moved\n' });
  const head = await stub.rebase();
  recordPRAnswer(ctx.db, { repo: 'gadgets', pr: 7, answer: 'lgtm', head: stub.oldHead, source: 'chat:kettle-1', note: null, actor: 'z-kettle' });

  await expect(ctx.runRebased({ repo: 'gadgets', head, from: stub.oldHead, gh: { 'gh repo clone': { code: 1, stdout: '', stderr: 'not found' } } })).rejects.toMatchObject({ code: 'git_unreadable', message: expect.stringContaining('get a checkout of zgeoff/gadgets') });

  expect(readHeadLgtm(ctx.db, 'gadgets', 7, head)).toBeNull();
});

test('it says the diff at the new head is empty when its content is already on main', async () => {
  const ctx = setupTest();
  const stub = await ctx.setupPR();
  await stub.moveMain({ 'notes.txt': ctx.edited, 'extra.txt': 'extra\n' });
  const head = await stub.rebase();

  await expect(ctx.runRebased({ head, base: await stub.readMainHead(), from: stub.oldHead })).rejects.toMatchObject({ code: 'not_carried', message: `the diff at ${head.slice(0, 7)} is empty against the base of zgeoff/widgets#7, so the lgtm is not carried and nothing is recorded` });

  expect(readHeadLgtm(ctx.db, 'widgets', 7, head)).toBeNull();
});
