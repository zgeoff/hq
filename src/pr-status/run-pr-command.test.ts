import { expect, onTestFinished, test } from 'bun:test';
import { applyAskItem } from '../apply-ask-item.ts';
import { addAsk } from '../asks/add-ask.ts';
import { answerAsk } from '../asks/answer-ask.ts';
import { openAsk } from '../asks/open-ask.ts';
import { logEvent } from '../log-event.ts';
import { parseItemInput } from '../parse-item-input.ts';
import { recordConsoleAnswer } from '../record-console-answer.ts';
import { buildFakeRunner } from '../../test/noslop-fake.ts';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import type { Flags } from '../cli.ts';
import { runPRCommand } from './run-pr-command.ts';
import { runCallAnswer } from '../asks/run-call-answer.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return {
    db: fresh.db,
    fileCall: (id: string, title: string) => {
      addAsk(fresh.db, { kind: 'call', id, title, question: 'Boil?', body: 'Body', issues: [], forSession: null, actor: 'z-kettle' });
      openAsk(fresh.db, { id, force: true, actor: 'z-stu' });
    },
    refileCall: (id: string, title: string) => {
      addAsk(fresh.db, { kind: 'call', id, title, question: 'Boil again?', body: 'Body', issues: [], forSession: null, actor: 'z-kettle' });
      openAsk(fresh.db, { id, force: true, actor: 'z-stu' });
    },
    fileGrantCall: (id: string, grants: Record<string, string>) => {
      applyAskItem(fresh.db, { kind: 'call', id, issues: [], forSession: null, actor: 'z-kettle' }, parseItemInput('call', JSON.stringify({ title: 'Merge widgets#7?', question: 'Merge past the red check?', options: [{ label: 'Go', effect: 'Merge it.', grants }, { label: 'Wait', effect: 'Fix it first.' }] })), 'Merge past the red check?');
      recordConsoleAnswer(fresh.db, { id, option: 'Go', note: '', actor: 'owner' });
    },
    answerInHq: (id: string) => answerAsk(fresh.db, { id, kind: 'call', answer: 'Yes', actor: 'z-stu' }),
    answerByHqCall: async (id: string, verdict: 'owner' | 'other', actor = 'z-stu') => await runCallAnswer(fresh.db, { id, kind: 'call', answer: 'Yes', actor }, () => Promise.resolve({ verdict })),
    answerInConsole: (id: string) => recordConsoleAnswer(fresh.db, { id, option: '', note: 'Yes', actor: 'owner' }),
    headAt: (head: string) => buildFakeRunner({ prHead: { code: 0, stdout: JSON.stringify({ headRefOid: head }), stderr: '' } }),
    ghDown: () => buildFakeRunner({ prHead: { code: 1, stdout: '', stderr: 'gh: could not resolve to a PullRequest' } }),
    actor: () => Promise.resolve('z-kettle'),
    override: async (fake: ReturnType<typeof buildFakeRunner>, flags: Flags) => await runPRCommand({ run: fake.run, db: fresh.db, verb: 'override', rest: ['widgets', '7'], flags, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'owner' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) }),
    asOwner: async (fake: ReturnType<typeof buildFakeRunner>, verb: string, rest: string[], flags: Flags) => await runPRCommand({ run: fake.run, db: fresh.db, verb, rest, flags, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'owner' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) }),
    asOther: async (fake: ReturnType<typeof buildFakeRunner>, verb: string, rest: string[], flags: Flags) => await runPRCommand({ run: fake.run, db: fresh.db, verb, rest, flags, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) }),
    status: async (fake: ReturnType<typeof buildFakeRunner>) => await runPRCommand({ run: fake.run, db: fresh.db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) }),
    answer: async (fake: ReturnType<typeof buildFakeRunner>, answer: string, flags: Flags) => await runPRCommand({ run: fake.run, db: fresh.db, verb: 'answer', rest: ['widgets', '7', answer], flags, actor: () => Promise.resolve('z-kettle'), readOwnerSession: () => Promise.resolve({ verdict: 'owner' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) }),
  };
}

test('it shows a changes answer at the head it was given, with its source and note', async () => {
  const ctx = setupTest();
  await ctx.answer(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'changes', { source: 'chat:kettle-12', note: 'Descale it first.' });

  await expect(runPRCommand({ run: ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678').run, db: ctx.db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).resolves.toStrictEqual({
    data: {
      pr: {
        repo: 'widgets',
        pr: 7,
        head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        headKnown: true,
        gate: null,
        gateHead: null,
        gateAt: null,
        gateStale: false,
        answer: 'changes',
        answerHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        answerSource: 'chat:kettle-12',
        answerNote: 'Descale it first.',
        answerAt: '2026-10-14T01:00:00Z',
        answerStale: false,
        next: null,
        nextAt: null,
        override: null,
        ciOverrides: [],
        reviewRecords: { mechanical: null, exemption: null },
        updatedAt: '2026-10-14T01:00:00Z',
      },
    },
    text: ['widgets#7  head a1b2c3d', 'gate: not recorded', 'answer: changes at a1b2c3d via chat:kettle-12 (2026-10-14T01:00:00Z): Descale it first.', 'next: nobody'].join('\n'),
  });
});

test.each(['lgtm', 'changes'])('it marks an older %s answer stale at the head it was given once the PR has a new head', async (answer) => {
  const ctx = setupTest();
  await ctx.answer(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), answer, { source: 'chat:kettle-3', note: 'Shorter spout.' });

  await expect(runPRCommand({ run: ctx.headAt('b9c8d7e6f5a40312213f4e5d6c7b8a9087654321').run, db: ctx.db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).resolves.toStrictEqual({
    data: {
      pr: {
        repo: 'widgets',
        pr: 7,
        head: 'b9c8d7e6f5a40312213f4e5d6c7b8a9087654321',
        headKnown: true,
        gate: null,
        gateHead: null,
        gateAt: null,
        gateStale: false,
        answer,
        answerHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        answerSource: 'chat:kettle-3',
        answerNote: 'Shorter spout.',
        answerAt: '2026-10-14T01:00:00Z',
        answerStale: true,
        next: null,
        nextAt: null,
        override: null,
        ciOverrides: [],
        reviewRecords: { mechanical: null, exemption: null },
        updatedAt: '2026-10-14T01:00:00Z',
      },
    },
    text: ['widgets#7  head b9c8d7e', 'gate: not recorded', `answer: ${answer} stale at a1b2c3d via chat:kettle-3 (2026-10-14T01:00:00Z): Shorter spout.`, 'next: nobody'].join('\n'),
  });
});

test('it keeps the PR head hq last saw on the record', async () => {
  const ctx = setupTest();
  await ctx.answer(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'lgtm', { source: 'chat:kettle-1' });

  await runPRCommand({ run: ctx.headAt('b9c8d7e6f5a40312213f4e5d6c7b8a9087654321').run, db: ctx.db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(ctx.db.query('SELECT head, answer_head FROM pr_status').all()).toStrictEqual([{ head: 'b9c8d7e6f5a40312213f4e5d6c7b8a9087654321', answer_head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }]);
});

test.each([
  ['empty', ''],
  ['blank', '   '],
  ['of an unknown kind', 'telegram:55'],
  ['without an id', 'chat:'],
  ['without a kind', 'kettle-12'],
])('it refuses an answer whose --source is %s, and stores nothing', async (_case, source) => {
  const ctx = setupTest();

  await expect(ctx.answer(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'lgtm', { source })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('chat:<id>, console:<id> or call:<id>') });

  expect(ctx.db.query('SELECT COUNT(*) AS n FROM pr_status').get()).toStrictEqual({ n: 0 });
});

test('it refuses an answer with no --source flag at all, and stores nothing', async () => {
  const ctx = setupTest();

  await expect(ctx.answer(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'lgtm', {})).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('--source is required') });

  expect(ctx.db.query('SELECT COUNT(*) AS n FROM pr_status').get()).toStrictEqual({ n: 0 });
});

test('it refuses a changes answer with a blank note, and stores nothing', async () => {
  const ctx = setupTest();

  await expect(ctx.answer(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'changes', { source: 'chat:kettle-12', note: '  ' })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('needs --note') });

  expect(ctx.db.query('SELECT COUNT(*) AS n FROM pr_status').get()).toStrictEqual({ n: 0 });
});

test('it refuses a changes answer with no --note flag at all, and stores nothing', async () => {
  const ctx = setupTest();

  await expect(ctx.answer(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'changes', { source: 'chat:kettle-12' })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('needs --note') });

  expect(ctx.db.query('SELECT COUNT(*) AS n FROM pr_status').get()).toStrictEqual({ n: 0 });
});

test('it refuses an answer when gh cannot give the head, and stores nothing', async () => {
  const ctx = setupTest();

  await expect(ctx.answer(ctx.ghDown(), 'lgtm', { source: 'chat:kettle-12' })).rejects.toMatchObject({ code: 'head_unreadable' });

  expect(ctx.db.query('SELECT COUNT(*) AS n FROM pr_status').get()).toStrictEqual({ n: 0 });
});

test('it prints the stored record and says stale is unknown when gh cannot give the head', async () => {
  const ctx = setupTest();
  await ctx.answer(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'reject', { source: 'chat:review-7', note: 'Wrong spout.' });

  await expect(runPRCommand({ run: ctx.ghDown().run, db: ctx.db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).resolves.toStrictEqual({
    data: {
      pr: {
        repo: 'widgets',
        pr: 7,
        head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        headKnown: false,
        gate: null,
        gateHead: null,
        gateAt: null,
        gateStale: false,
        answer: 'reject',
        answerHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        answerSource: 'chat:review-7',
        answerNote: 'Wrong spout.',
        answerAt: '2026-10-14T01:00:00Z',
        answerStale: false,
        next: null,
        nextAt: null,
        override: null,
        ciOverrides: [],
        reviewRecords: { mechanical: null, exemption: null },
        updatedAt: '2026-10-14T01:00:00Z',
      },
    },
    text: [
      'widgets#7  last seen head a1b2c3d',
      'gate: not recorded',
      'answer: reject at a1b2c3d via chat:review-7 (2026-10-14T01:00:00Z): Wrong spout.',
      'next: nobody',
      'The PR head could not be read, so stale is unknown.',
    ].join('\n'),
  });
});

test('it says a PR has no record, without calling gh', async () => {
  const ctx = setupTest(),
    fake = ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'),
    shown = await runPRCommand({ run: fake.run, db: ctx.db, verb: 'status', rest: ['widgets', '9'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(shown).toStrictEqual({ data: { pr: null }, text: 'No record for widgets#9.' });
  expect(fake.calls).toStrictEqual([]);
});

test('it reads the record of a PR named with the zgeoff owner', async () => {
  const ctx = setupTest(),
    fake = ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');

  await expect(runPRCommand({ run: fake.run, db: ctx.db, verb: 'status', rest: ['zgeoff/widgets', '9'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).resolves.toStrictEqual({ data: { pr: null }, text: 'No record for widgets#9.' });
});

test.each(['status', 'answer', 'next'])('it refuses hq pr %s for a PR of an owner other than zgeoff, and stores nothing', async (verb) => {
  const ctx = setupTest();

  await expect(runPRCommand({ run: ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678').run, db: ctx.db, verb, rest: ['kettle-co/widgets', '7', 'lgtm'], flags: { source: 'chat:kettle-12' }, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({
    code: 'bad_args',
    message: "hq pr keeps records for zgeoff's PRs only, not kettle-co/widgets; give the bare repo name or zgeoff/<repo>",
  });

  expect(ctx.db.query('SELECT COUNT(*) AS n FROM pr_status').get()).toStrictEqual({ n: 0 });
});

test('it logs an event for an answer', async () => {
  const ctx = setupTest();

  await ctx.answer(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'lgtm', { source: 'chat:kettle-12' });

  expect(ctx.db.query("SELECT action, actor FROM events WHERE subject_id = 'pr:widgets#7'").all()).toStrictEqual([{ action: 'pr-answer', actor: 'z-kettle' }]);
});

test('it sets who holds the next step, and shows the record against the head gh gives now', async () => {
  const ctx = setupTest();

  await expect(runPRCommand({ run: ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678').run, db: ctx.db, verb: 'next', rest: ['widgets', '7', 'z-stu'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).resolves.toStrictEqual({
    data: {
      pr: {
        repo: 'widgets',
        pr: 7,
        head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        headKnown: true,
        gate: null,
        gateHead: null,
        gateAt: null,
        gateStale: false,
        answer: null,
        answerHead: null,
        answerSource: null,
        answerNote: null,
        answerAt: null,
        answerStale: false,
        next: 'z-stu',
        nextAt: '2026-10-14T01:00:00Z',
        override: null,
        ciOverrides: [],
        reviewRecords: { mechanical: null, exemption: null },
        updatedAt: '2026-10-14T01:00:00Z',
      },
    },
    text: ['widgets#7  head a1b2c3d', 'gate: not recorded', 'answer: none', 'next: z-stu (2026-10-14T01:00:00Z)'].join('\n'),
  });
});

test('it logs an event for a next step', async () => {
  const ctx = setupTest();

  await runPRCommand({ run: ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678').run, db: ctx.db, verb: 'next', rest: ['widgets', '7', 'z-stu'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(ctx.db.query("SELECT action FROM events WHERE subject_id = 'pr:widgets#7'").all()).toStrictEqual([{ action: 'pr-next' }]);
});

test('it says the head was never seen and could not be read when gh is down for a next step on a PR with no record', async () => {
  const ctx = setupTest(),
    shown = await runPRCommand({ run: ctx.ghDown().run, db: ctx.db, verb: 'next', rest: ['widgets', '7', 'z-stu'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(shown.text).toBe(['widgets#7  head never seen', 'gate: not recorded', 'answer: none', 'next: z-stu (2026-10-14T01:00:00Z)', 'The PR head could not be read, so stale is unknown.'].join('\n'));
});

test('it clears who holds the next step', async () => {
  const ctx = setupTest();
  await runPRCommand({ run: ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678').run, db: ctx.db, verb: 'next', rest: ['widgets', '7', 'z-stu'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  await runPRCommand({ run: ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678').run, db: ctx.db, verb: 'next', rest: ['widgets', '7'], flags: { clear: true }, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) });

  expect(ctx.db.query('SELECT next, next_at FROM pr_status').all()).toStrictEqual([{ next: null, next_at: null }]);
});

test('it refuses a next step held by a session that is not declared, naming the declared ones', async () => {
  const ctx = setupTest();

  await expect(runPRCommand({ run: ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678').run, db: ctx.db, verb: 'next', rest: ['widgets', '7', 'z-nobody'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('z-stu') });

  expect(ctx.db.query('SELECT COUNT(*) AS n FROM pr_status').get()).toStrictEqual({ n: 0 });
});

test('it refuses a next step with neither a session nor --clear, with the usage', async () => {
  const ctx = setupTest();

  await expect(runPRCommand({ run: ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678').run, db: ctx.db, verb: 'next', rest: ['widgets', '7'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({
    code: 'bad_args',
    message: 'usage: hq pr next <repo> <pr> <session> | --clear',
  });

  expect(ctx.db.query('SELECT COUNT(*) AS n FROM pr_status').get()).toStrictEqual({ n: 0 });
});

test('it refuses a next step that gives both a session and --clear', async () => {
  const ctx = setupTest();

  await expect(runPRCommand({ run: ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678').run, db: ctx.db, verb: 'next', rest: ['widgets', '7', 'z-stu'], flags: { clear: true }, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).rejects.toMatchObject({
    code: 'bad_args',
    message: 'give a session or --clear, not both; usage: hq pr next <repo> <pr> <session> | --clear',
  });

  expect(ctx.db.query('SELECT COUNT(*) AS n FROM pr_status').get()).toStrictEqual({ n: 0 });
});

test('it shows a gate none plainly, as a PR noslop does not review', async () => {
  const ctx = setupTest();
  ctx.db.query("INSERT INTO pr_status (repo, pr, head, gate, gate_head, gate_at, updated_at) VALUES ('widgets', 7, NULL, 'none', NULL, '2026-10-14T01:00:00Z', '2026-10-14T01:00:00Z')").run();

  await expect(runPRCommand({ run: ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678').run, db: ctx.db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).resolves.toStrictEqual({
    data: {
      pr: {
        repo: 'widgets',
        pr: 7,
        head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        headKnown: true,
        gate: 'none',
        gateHead: null,
        gateAt: '2026-10-14T01:00:00Z',
        gateStale: false,
        answer: null,
        answerHead: null,
        answerSource: null,
        answerNote: null,
        answerAt: null,
        answerStale: false,
        next: null,
        nextAt: null,
        override: null,
        ciOverrides: [],
        reviewRecords: { mechanical: null, exemption: null },
        updatedAt: '2026-10-14T01:00:00Z',
      },
    },
    text: ['widgets#7  head a1b2c3d', 'gate: none (noslop does not review this PR) (2026-10-14T01:00:00Z)', 'answer: none', 'next: nobody'].join('\n'),
  });
});

test("it marks a gate recorded at an older head stale once the PR has a new head", async () => {
  const ctx = setupTest();
  ctx.db.query("INSERT INTO pr_status (repo, pr, head, gate, gate_head, gate_at, updated_at) VALUES ('widgets', 7, 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', 'pass', 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', '2026-10-14T01:00:00Z', '2026-10-14T01:00:00Z')").run();

  await expect(runPRCommand({ run: ctx.headAt('b9c8d7e6f5a40312213f4e5d6c7b8a9087654321').run, db: ctx.db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).resolves.toStrictEqual({
    data: {
      pr: {
        repo: 'widgets',
        pr: 7,
        head: 'b9c8d7e6f5a40312213f4e5d6c7b8a9087654321',
        headKnown: true,
        gate: 'pass',
        gateHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        gateAt: '2026-10-14T01:00:00Z',
        gateStale: true,
        answer: null,
        answerHead: null,
        answerSource: null,
        answerNote: null,
        answerAt: null,
        answerStale: false,
        next: null,
        nextAt: null,
        override: null,
        ciOverrides: [],
        reviewRecords: { mechanical: null, exemption: null },
        updatedAt: '2026-10-14T01:00:00Z',
      },
    },
    text: ['widgets#7  head b9c8d7e', 'gate: pass stale at a1b2c3d (2026-10-14T01:00:00Z)', 'answer: none', 'next: nobody'].join('\n'),
  });
});

test("it shows a gate recorded at the PR's head now as not stale", async () => {
  const ctx = setupTest();
  ctx.db.query("INSERT INTO pr_status (repo, pr, head, gate, gate_head, gate_at, updated_at) VALUES ('widgets', 7, 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', 'pass', 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', '2026-10-14T01:00:00Z', '2026-10-14T01:00:00Z')").run();

  await expect(runPRCommand({ run: ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678').run, db: ctx.db, verb: 'status', rest: ['widgets', '7'], flags: {}, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'other' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) })).resolves.toStrictEqual({
    data: {
      pr: {
        repo: 'widgets',
        pr: 7,
        head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        headKnown: true,
        gate: 'pass',
        gateHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
        gateAt: '2026-10-14T01:00:00Z',
        gateStale: false,
        answer: null,
        answerHead: null,
        answerSource: null,
        answerNote: null,
        answerAt: null,
        answerStale: false,
        next: null,
        nextAt: null,
        override: null,
        ciOverrides: [],
        reviewRecords: { mechanical: null, exemption: null },
        updatedAt: '2026-10-14T01:00:00Z',
      },
    },
    text: ['widgets#7  head a1b2c3d', 'gate: pass at a1b2c3d (2026-10-14T01:00:00Z)', 'answer: none', 'next: nobody'].join('\n'),
  });
});

test('it records an override at the head now, holding the head, source, note and its open-findings scope', async () => {
  const ctx = setupTest();

  await ctx.override(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), { source: 'chat:kettle-12', note: 'The base moved under the stack.' });

  expect(ctx.db.query("SELECT subject_id, actor, data FROM events WHERE action = 'pr-override'").all()).toStrictEqual([
    { subject_id: 'pr:widgets#7', actor: 'z-kettle', data: JSON.stringify({ head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-12', note: 'The base moved under the stack.', scope: 'open-findings' }) },
  ]);
});

test.each([
  ['no --source', { note: 'Rebased.' }],
  ['no --note', { source: 'chat:kettle-12' }],
  ['a blank --note', { source: 'chat:kettle-12', note: '  ' }],
])('it refuses an override with %s, and records nothing', async (_case, flags) => {
  const ctx = setupTest();

  await expect(ctx.override(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), flags)).rejects.toMatchObject({ code: 'bad_args' });

  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-override'").get()).toStrictEqual({ total: 0 });
});

test.each([
  ['empty', ''],
  ['blank', '   '],
  ['of an unknown kind', 'telegram:55'],
  ['a session\'s own words', 'session:z-kettle'],
  ['without an id', 'chat:'],
  ['without a kind', 'kettle-12'],
])('it refuses an override whose --source is %s, as it refuses an answer', async (_case, source) => {
  const ctx = setupTest();
  const head = ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');

  await expect(ctx.answer(head, 'lgtm', { source })).rejects.toMatchObject({ code: 'bad_args' });
  await expect(ctx.override(head, { source, note: 'Rebased.' })).rejects.toMatchObject({ code: 'bad_args' });
});

test('it refuses an override when gh cannot give the head, and records nothing', async () => {
  const ctx = setupTest();

  await expect(ctx.override(ctx.ghDown(), { source: 'chat:kettle-12', note: 'Rebased.' })).rejects.toMatchObject({ code: 'head_unreadable' });

  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-override'").get()).toStrictEqual({ total: 0 });
});

test('it shows the override that stands at the head now, in text and in JSON', async () => {
  const ctx = setupTest();
  const head = ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');
  await ctx.answer(head, 'lgtm', { source: 'chat:kettle-1' });
  await ctx.override(head, { source: 'chat:kettle-2', note: 'The base moved under the stack.' });

  const shown = await ctx.status(head);

  expect(shown.text).toInclude('override: at a1b2c3d via chat:kettle-2 (2026-10-14T01:00:00Z): The base moved under the stack.');
  expect(shown.data).toMatchObject({ pr: { override: { head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-2', note: 'The base moved under the stack.', at: '2026-10-14T01:00:00Z' } } });
});

test('it shows no override once the PR has a new head', async () => {
  const ctx = setupTest();
  const head = ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');
  await ctx.answer(head, 'lgtm', { source: 'chat:kettle-1' });
  await ctx.override(head, { source: 'chat:kettle-2', note: 'The base moved under the stack.' });

  const shown = await ctx.status(ctx.headAt('b9c8d7e6f5a40312213f4e5d6c7b8a9087654321'));

  expect(shown.data).toMatchObject({ pr: { override: null } });
  expect(shown.text).not.toInclude('override:');
});

test('it shows a standing override for a PR with no record, in text and in JSON', async () => {
  const ctx = setupTest();
  const head = ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');
  await ctx.override(head, { source: 'chat:kettle-2', note: 'The base moved under the stack.' });
  ctx.db.query('DELETE FROM pr_status').run();

  const shown = await ctx.status(head);

  expect(shown).toStrictEqual({
    data: { pr: null, override: { head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-2', note: 'The base moved under the stack.', at: '2026-10-14T01:00:00Z' } },
    text: 'No record for widgets#7.\noverride: at a1b2c3d via chat:kettle-2 (2026-10-14T01:00:00Z): The base moved under the stack.',
  });
});

test.each(['override', 'accept-risk'])('it refuses a chat: source for %s from a caller that is not the owner session, and records nothing', async (verb) => {
  const ctx = setupTest();

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), verb, ['widgets', '7', 'aaaa'], { source: 'chat:kettle-12', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: '--source refused: a chat: source is accepted only from the session of the owner (z-stu), as atc finds the caller; this caller is not it; ask z-stu to record it' });

  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action IN ('pr-override', 'pr-accepted-risk')").get()).toStrictEqual({ total: 0 });
});

test('it refuses a chat: source with the cause when atc cannot say whether the caller is the owner session', async () => {
  const ctx = setupTest();

  await expect(
    runPRCommand({ run: ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678').run, db: ctx.db, verb: 'override', rest: ['widgets', '7'], flags: { source: 'chat:kettle-12', note: 'Ship it.' }, actor: ctx.actor, readOwnerSession: () => Promise.resolve({ verdict: 'unknown', cause: 'connect ENOENT /run/teapot.sock' }), readReviewerSession: () => Promise.resolve({ verdict: 'match' }) }),
  ).rejects.toMatchObject({ code: 'bad_args', message: '--source refused: a chat: source is accepted only from the session of the owner (z-stu), and atc could not say whether this caller is it: connect ENOENT /run/teapot.sock; ask z-stu to record it' });
});

test.each(['override', 'accept-risk'])('it records a chat: source for %s from the owner session', async (verb) => {
  const ctx = setupTest();

  await ctx.asOwner(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), verb, ['widgets', '7', 'aaaa'], { source: 'chat:kettle-12', note: 'Ship it.' });

  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action IN ('pr-override', 'pr-accepted-risk')").get()).toStrictEqual({ total: 1 });
});

test.each(['override', 'accept-risk'])('it refuses a call: source for %s that names no call in hq', async (verb) => {
  const ctx = setupTest();

  await expect(ctx.asOwner(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), verb, ['widgets', '7', 'aaaa'], { source: 'call:KET-9', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: '--source refused: call:KET-9 is not a call in hq; ask z-stu to record it' });
});

test('it refuses a call: source for a call the owner has not answered', async () => {
  const ctx = setupTest();
  ctx.fileCall('KET-4', 'Pour widgets#7 now?');

  await expect(ctx.asOwner(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'call:KET-4', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: "--source refused: call:KET-4 has no owner answer for its current round, in the console or by `hq call answer` from the owner's session (z-stu), as atc finds the caller; ask z-stu to record it" });
});

test('it refuses a call: source for an hq call answer recorded with no owner-session mark', async () => {
  const ctx = setupTest();
  ctx.fileCall('KET-4', 'Pour widgets#7 now?');
  ctx.answerInHq('KET-4');

  await expect(ctx.asOwner(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'call:KET-4', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: "--source refused: call:KET-4 has no owner answer for its current round, in the console or by `hq call answer` from the owner's session (z-stu), as atc finds the caller; ask z-stu to record it" });
});

test('it accepts a call: source for accept-risk from a call answered by hq call answer in the z-stu session', async () => {
  const ctx = setupTest();
  ctx.fileCall('KET-11', 'Accept-risk aaaa on widgets#7?');
  await ctx.answerByHqCall('KET-11', 'owner');

  await ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'accept-risk', ['widgets', '7', 'aaaa'], { source: 'call:KET-11', note: 'Ship it.' });

  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action IN ('pr-override', 'pr-accepted-risk')").get()).toStrictEqual({ total: 1 });
});

test('it refuses a call: source answered by hq call answer --by z-stu from another session, and records nothing', async () => {
  const ctx = setupTest();
  ctx.fileCall('KET-12', 'Pour widgets#7 now?');
  await ctx.answerByHqCall('KET-12', 'other');

  await expect(ctx.asOwner(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'call:KET-12', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: "--source refused: call:KET-12 has no owner answer for its current round, in the console or by `hq call answer` from the owner's session (z-stu), as atc finds the caller; ask z-stu to record it" });
  expect(ctx.db.query("SELECT actor FROM events WHERE subject_id = 'KET-12' AND action = 'answered'").all()).toStrictEqual([{ actor: 'z-stu' }]);
  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-override'").get()).toStrictEqual({ total: 0 });
});

test('it refuses a call: source for the PR a refiled call names until the owner answers the new round', async () => {
  const ctx = setupTest();
  ctx.fileCall('KET-21', 'Pour widgets#7 now?');
  ctx.answerInConsole('KET-21');
  ctx.refileCall('KET-21', 'Pour widgets#8 now?');
  const refusal = "--source refused: call:KET-21 has no owner answer for its current round, in the console or by `hq call answer` from the owner's session (z-stu), as atc finds the caller; ask z-stu to record it";

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '8'], { source: 'call:KET-21', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: refusal });
  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'call:KET-21', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: refusal });
  ctx.answerInHq('KET-21');
  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '8'], { source: 'call:KET-21', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: refusal });
  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-override'").get()).toStrictEqual({ total: 0 });
});

test.each([
  ['the console', (ctx: ReturnType<typeof setupTest>) => Promise.resolve(ctx.answerInConsole('KET-22'))],
  ['hq call answer in the z-stu session', async (ctx: ReturnType<typeof setupTest>) => await ctx.answerByHqCall('KET-22', 'owner')],
])('it accepts a call: source for the PR a refiled call names once the owner answers the new round in %s', async (_case, answerNewRound) => {
  const ctx = setupTest();
  ctx.fileCall('KET-22', 'Accept-risk aaaa on widgets#7?');
  ctx.answerInConsole('KET-22');
  ctx.refileCall('KET-22', 'Accept-risk aaaa on widgets#8?');
  await answerNewRound(ctx);

  await ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'accept-risk', ['widgets', '8', 'aaaa'], { source: 'call:KET-22', note: 'Ship it.' });

  expect(ctx.db.query("SELECT subject_id FROM events WHERE action = 'pr-accepted-risk'").all()).toStrictEqual([{ subject_id: 'pr:widgets#8' }]);
});

test.each([
  ['another PR', 'Accept-risk aaaa on widgets#8?'],
  ['a longer PR number', 'Accept-risk aaaa on widgets#70?'],
  ['another repo', 'Accept-risk aaaa on teapots#7?'],
  ['another owner', 'Accept-risk aaaa on kettleco/widgets#7?'],
  ['no PR', 'Accept-risk aaaa on the kettle?'],
])('it refuses a call: source for a console-answered call about %s', async (_case, title) => {
  const ctx = setupTest();
  ctx.fileCall('KET-4', title);
  ctx.answerInConsole('KET-4');

  await expect(ctx.asOwner(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'accept-risk', ['widgets', '7', 'aaaa'], { source: 'call:KET-4', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: '--source refused: call:KET-4 does not name zgeoff/widgets#7 in the title the owner answered; ask z-stu to record it' });
});

test.each(['Accept-risk aaaa on zgeoff/widgets#7?', 'Widgets#7: accept-risk aaaa?'])('it accepts a call: source for accept-risk from a console-answered call titled %s', async (title) => {
  const ctx = setupTest();
  ctx.fileCall('KET-5', title);
  ctx.answerInConsole('KET-5');

  await ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'accept-risk', ['widgets', '7', 'aaaa'], { source: 'call:KET-5', note: 'Ship it.' });

  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-accepted-risk'").get()).toStrictEqual({ total: 1 });
});

test.each([
  ['the console', (ctx: ReturnType<typeof setupTest>) => Promise.resolve(ctx.answerInConsole('KET-5'))],
  ['hq call answer in the z-stu session', async (ctx: ReturnType<typeof setupTest>) => await ctx.answerByHqCall('KET-5', 'owner')],
])('it refuses a call: source for override from a plain Yes in %s, since a plain yes names no head', async (_case, answer) => {
  const ctx = setupTest();
  ctx.fileCall('KET-5', 'Override widgets#7 now?');
  await answer(ctx);

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'call:KET-5', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: '--source refused: call:KET-5 has no option that grants the override: an override needs the owner to pick an option whose grants name the PR and the head, and a plain yes names no head; ask z-stu to record it' });
  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-override'").get()).toStrictEqual({ total: 0 });
});

test.each([
  { verb: 'accept-risk', rest: ['widgets', '7', 'aaaa'], title: 'Override widgets#7?', why: 'accept-risk of finding aaaa' },
  { verb: 'accept-risk', rest: ['widgets', '7', 'aaaa'], title: 'Accept-risk bbbb on widgets#7?', why: 'accept-risk of finding aaaa' },
  { verb: 'accept-risk', rest: ['widgets', '7', 'aaaa'], title: 'Accept-risk aaaab on widgets#7?', why: 'accept-risk of finding aaaa' },
])('it refuses a call: source for $verb from a Yes to the call titled $title, and records nothing', async (row) => {
  const ctx = setupTest();
  ctx.fileCall('KET-34', row.title);
  ctx.answerInConsole('KET-34');

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), row.verb, [...row.rest], { source: 'call:KET-34', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: `--source refused: call:KET-34 does not name ${row.why} in the title the owner answered; ask z-stu to record it` });
  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action IN ('pr-override', 'pr-accepted-risk')").get()).toStrictEqual({ total: 0 });
});

test.each(['No', 'No | Not this head.', 'Yes, but not yet', 'Later'])('it refuses a call: source for a call the owner answered %p in the console, and records nothing', async (note) => {
  const ctx = setupTest();
  ctx.fileCall('KET-31', 'Accept-risk aaaa on widgets#7?');
  recordConsoleAnswer(ctx.db, { id: 'KET-31', option: '', note, actor: 'owner' });

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'accept-risk', ['widgets', '7', 'aaaa'], { source: 'call:KET-31', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: `--source refused: the owner's answer to call:KET-31 is not a yes: "${note}"; ask z-stu to record it` });
  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-accepted-risk'").get()).toStrictEqual({ total: 0 });
});

test('it refuses a call: source for a call the owner answered No by hq call answer in the z-stu session', async () => {
  const ctx = setupTest();
  ctx.fileCall('KET-32', 'Accept-risk aaaa on widgets#7?');
  answerAsk(ctx.db, { id: 'KET-32', kind: 'call', answer: 'No', actor: 'z-stu', ownerSession: true });

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'accept-risk', ['widgets', '7', 'aaaa'], { source: 'call:KET-32', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: `--source refused: the owner's answer to call:KET-32 is not a yes: "No"; ask z-stu to record it` });
});

test.each(['yes', 'Yes.', 'Yes | Descale it first.'])('it accepts a call: source for a call the owner answered %p in the console', async (note) => {
  const ctx = setupTest();
  ctx.fileCall('KET-33', 'Accept-risk aaaa on widgets#7?');
  recordConsoleAnswer(ctx.db, { id: 'KET-33', option: '', note, actor: 'owner' });

  await ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'accept-risk', ['widgets', '7', 'aaaa'], { source: 'call:KET-33', note: 'Ship it.' });

  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-accepted-risk'").get()).toStrictEqual({ total: 1 });
});

test.each(['override', 'accept-risk'])('it refuses a console: source for %s that names no call', async (verb) => {
  const ctx = setupTest();

  await expect(ctx.asOwner(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), verb, ['widgets', '7', 'aaaa'], { source: 'console:KET-6', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: '--source refused: console:KET-6 is not a call in hq; ask z-stu to record it' });
});

test('it refuses a console: source whose only event is a mark, not an answer', async () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'unblock', 'KET-7', 'console-mark', 'owner', null, null, {});

  await expect(ctx.asOwner(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'console:KET-7', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args' });
});

test('it refuses a console: source that is a review answer, for an override', async () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'unblock', 'review-8', 'console-review', 'owner', null, null, { review: 'lgtm', note: null });

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'console:review-8', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: '--source refused: console:review-8 is not a call in hq; ask z-stu to record it' });
  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-override'").get()).toStrictEqual({ total: 0 });
});

test('it refuses a console: source for a call whose options grant nothing, even when the owner answered Yes', async () => {
  const ctx = setupTest();
  applyAskItem(ctx.db, { kind: 'call', id: 'KET-41', issues: [], forSession: null, actor: 'z-kettle' }, parseItemInput('call', JSON.stringify({ title: 'Override widgets#7?', question: 'Override widgets#7?', options: [{ label: 'Yes', effect: 'Merge it.' }, { label: 'No', effect: 'Wait.' }] })), 'Override widgets#7?');
  recordConsoleAnswer(ctx.db, { id: 'KET-41', option: 'Yes', note: '', actor: 'owner' });

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'console:KET-41', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: '--source refused: the option the owner picked in console:KET-41 ("Yes") grants no override; ask z-stu to record it' });
});

test.each([
  { mismatch: 'an action', verb: 'override', rest: ['widgets', '7'], grants: { action: 'accept-risk', pr: 'zgeoff/widgets#7', finding: 'aaaa', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }, why: 'accept-risk of zgeoff/widgets#7 finding aaaa at a1b2c3d, not override of zgeoff/widgets#7 at a1b2c3d' },
  { mismatch: 'a repo', verb: 'override', rest: ['widgets', '7'], grants: { action: 'override', pr: 'zgeoff/teapots#7', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }, why: 'override of zgeoff/teapots#7 at a1b2c3d, not override of zgeoff/widgets#7 at a1b2c3d' },
  { mismatch: 'a PR', verb: 'override', rest: ['widgets', '7'], grants: { action: 'override', pr: 'zgeoff/widgets#8', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }, why: 'override of zgeoff/widgets#8 at a1b2c3d, not override of zgeoff/widgets#7 at a1b2c3d' },
  { mismatch: 'a finding', verb: 'accept-risk', rest: ['widgets', '7', 'aaaa'], grants: { action: 'accept-risk', pr: 'zgeoff/widgets#7', finding: 'bbbb' }, why: 'accept-risk of zgeoff/widgets#7 finding bbbb, not accept-risk of zgeoff/widgets#7 finding aaaa' },
])('it refuses a console: source whose picked option grants $mismatch other than the one asked for', async (row) => {
  const ctx = setupTest();
  applyAskItem(ctx.db, { kind: 'call', id: 'KET-40', issues: [], forSession: null, actor: 'z-kettle' }, parseItemInput('call', JSON.stringify({ title: 'Override?', question: 'Merge past the findings?', options: [{ label: 'Override', effect: 'Merge it.', grants: row.grants }, { label: 'Wait', effect: 'Fix them first.' }] })), 'Merge past the findings?');
  recordConsoleAnswer(ctx.db, { id: 'KET-40', option: 'Override', note: '', actor: 'owner' });

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), row.verb, [...row.rest], { source: 'console:KET-40', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: `--source refused: the option the owner picked in console:KET-40 grants ${row.why}; ask z-stu to record it` });
  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action IN ('pr-override', 'pr-accepted-risk')").get()).toStrictEqual({ total: 0 });
});

test('it refuses a source whose owner picked the option that grants nothing', async () => {
  const ctx = setupTest();
  applyAskItem(ctx.db, { kind: 'call', id: 'KET-43', issues: [], forSession: null, actor: 'z-kettle' }, parseItemInput('call', JSON.stringify({ title: 'Override?', question: 'Merge past the findings?', options: [{ label: 'Override', effect: 'Merge it.', grants: { action: 'override', pr: 'zgeoff/widgets#7' } }, { label: 'Wait', effect: 'Fix them first.' }] })), 'Merge past the findings?');
  recordConsoleAnswer(ctx.db, { id: 'KET-43', option: 'Wait', note: 'Fix the spout first.', actor: 'owner' });

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'call:KET-43', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: '--source refused: the option the owner picked in call:KET-43 ("Wait") grants no override; ask z-stu to record it' });
});

test.each(['console:KET-42', 'call:KET-42'])('it records an accepted risk from %s when the picked option grants it, whatever its label', async (source) => {
  const ctx = setupTest();
  applyAskItem(ctx.db, { kind: 'call', id: 'KET-42', issues: [], forSession: null, actor: 'z-kettle' }, parseItemInput('call', JSON.stringify({ title: 'Accept the spout risk?', question: 'Accept finding aaaa on widgets#7?', options: [{ label: 'Accept it', effect: 'It merges with the risk.', grants: { action: 'accept-risk', pr: 'zgeoff/widgets#7', finding: 'aaaa' } }, { label: 'Fix it', effect: 'Fix it first.' }] })), 'Accept finding aaaa on widgets#7?');
  recordConsoleAnswer(ctx.db, { id: 'KET-42', option: 'Accept it', note: 'Low risk.', actor: 'owner' });

  await ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'accept-risk', ['widgets', '7', 'aaaa'], { source, note: 'Ship it.' });

  expect(ctx.db.query("SELECT subject_id, data FROM events WHERE action = 'pr-accepted-risk'").all()).toStrictEqual([{ subject_id: 'pr:widgets#7', data: JSON.stringify({ finding: 'aaaa', source, note: 'Ship it.' }) }]);
});

test.each([
  { verb: 'override', rest: ['widgets', '7'], grants: { action: 'override', pr: 'zgeoff/widgets#7', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }, why: 'override of zgeoff/widgets#7 at a1b2c3d, not override of zgeoff/widgets#7 at b9c8d7e' },
  { verb: 'accept-risk', rest: ['widgets', '7', 'aaaa'], grants: { action: 'accept-risk', pr: 'zgeoff/widgets#7', finding: 'aaaa', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }, why: 'accept-risk of zgeoff/widgets#7 finding aaaa at a1b2c3d, not accept-risk of zgeoff/widgets#7 finding aaaa at b9c8d7e' },
])('it refuses a grant of $verb made for one head once the PR has another', async (row) => {
  const ctx = setupTest();
  applyAskItem(ctx.db, { kind: 'call', id: 'KET-44', issues: [], forSession: null, actor: 'z-kettle' }, parseItemInput('call', JSON.stringify({ title: 'Merge widgets#7?', question: 'Merge past the findings?', options: [{ label: 'Go', effect: 'Merge it.', grants: row.grants }, { label: 'Wait', effect: 'Fix them first.' }] })), 'Merge past the findings?');
  recordConsoleAnswer(ctx.db, { id: 'KET-44', option: 'Go', note: '', actor: 'owner' });

  await expect(ctx.asOther(ctx.headAt('b9c8d7e6f5a40312213f4e5d6c7b8a9087654321'), row.verb, [...row.rest], { source: 'console:KET-44', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: `--source refused: the option the owner picked in console:KET-44 grants ${row.why}; ask z-stu to record it` });
  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action IN ('pr-override', 'pr-accepted-risk')").get()).toStrictEqual({ total: 0 });
});

test('it records an override from a grant made for the head the PR has now', async () => {
  const ctx = setupTest();
  applyAskItem(ctx.db, { kind: 'call', id: 'KET-45', issues: [], forSession: null, actor: 'z-kettle' }, parseItemInput('call', JSON.stringify({ title: 'Merge widgets#7?', question: 'Merge past the findings?', options: [{ label: 'Go', effect: 'Merge it.', grants: { action: 'override', pr: 'zgeoff/widgets#7', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' } }, { label: 'Wait', effect: 'Fix them first.' }] })), 'Merge past the findings?');
  recordConsoleAnswer(ctx.db, { id: 'KET-45', option: 'Go', note: '', actor: 'owner' });

  await ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'console:KET-45', note: 'Ship it.' });

  expect(ctx.db.query("SELECT json_extract(data, '$.head') AS head FROM events WHERE action = 'pr-override'").all()).toStrictEqual([{ head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }]);
});

test.each([
  ['a grant at the first head', [{ label: 'Yes', effect: 'Merge it.', grants: { action: 'override', pr: 'zgeoff/widgets#7', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' } }, { label: 'No', effect: 'Wait.' }]],
])('it refuses a call: source from %s that already backs an override at another head, and keeps the first', async (_case, options) => {
  const ctx = setupTest();
  applyAskItem(ctx.db, { kind: 'call', id: 'KET-46', issues: [], forSession: null, actor: 'z-kettle' }, parseItemInput('call', JSON.stringify({ title: 'Override widgets#7?', question: 'Merge past the findings?', options })), 'Merge past the findings?');
  recordConsoleAnswer(ctx.db, { id: 'KET-46', option: 'Yes', note: '', actor: 'owner' });
  await ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'call:KET-46', note: 'Ship it.' });

  await expect(ctx.asOther(ctx.headAt('b9c8d7e6f5a40312213f4e5d6c7b8a9087654321'), 'override', ['widgets', '7'], { source: 'call:KET-46', note: 'Ship it again.' })).rejects.toMatchObject({ code: 'bad_args', message: '--source refused: call:KET-46 already backs an override of zgeoff/widgets#7 at a1b2c3d, and the owner answered it for that head only; ask z-stu to record it' });
  expect(ctx.db.query("SELECT json_extract(data, '$.head') AS head FROM events WHERE action = 'pr-override'").all()).toStrictEqual([{ head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }]);
});

test('it refuses a console: source whose picked option grants an override with no head', async () => {
  const ctx = setupTest();
  applyAskItem(ctx.db, { kind: 'call', id: 'KET-49', issues: [], forSession: null, actor: 'z-kettle' }, parseItemInput('call', JSON.stringify({ title: 'Override widgets#7?', question: 'Merge past the findings?', options: [{ label: 'Go', effect: 'Merge it.', grants: { action: 'override', pr: 'zgeoff/widgets#7' } }, { label: 'Wait', effect: 'Fix them first.' }] })), 'Merge past the findings?');
  recordConsoleAnswer(ctx.db, { id: 'KET-49', option: 'Go', note: '', actor: 'owner' });

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'console:KET-49', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: '--source refused: the option the owner picked in console:KET-49 grants an override with no head: an override grant names the head the owner approved; ask z-stu to record it' });
});

test('it refuses a console: source for an answer that already backs an override through call: at another head', async () => {
  const ctx = setupTest();
  applyAskItem(ctx.db, { kind: 'call', id: 'KET-47', issues: [], forSession: null, actor: 'z-kettle' }, parseItemInput('call', JSON.stringify({ title: 'Override widgets#7?', question: 'Merge past the findings?', options: [{ label: 'Yes', effect: 'Merge it.', grants: { action: 'override', pr: 'zgeoff/widgets#7', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' } }, { label: 'No', effect: 'Wait.' }] })), 'Merge past the findings?');
  recordConsoleAnswer(ctx.db, { id: 'KET-47', option: 'Yes', note: '', actor: 'owner' });
  await ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'call:KET-47', note: 'Ship it.' });

  await expect(ctx.asOther(ctx.headAt('b9c8d7e6f5a40312213f4e5d6c7b8a9087654321'), 'override', ['widgets', '7'], { source: 'console:KET-47', note: 'Ship it again.' })).rejects.toMatchObject({ code: 'bad_args', message: '--source refused: console:KET-47 already backs an override of zgeoff/widgets#7 at a1b2c3d, and the owner answered it for that head only; ask z-stu to record it' });
});

test('it accepts a call: source at a new head once the owner answers a new round, after it backed an override at the old head', async () => {
  const ctx = setupTest();
  const fileRound = (head: string) => {
    const question = `Merge past the findings at ${head.slice(0, 7)}?`;
    const item = parseItemInput('call', JSON.stringify({ title: 'Override widgets#7?', question, options: [{ label: 'Go', effect: 'Merge it.', grants: { action: 'override', pr: 'zgeoff/widgets#7', head } }, { label: 'Wait', effect: 'Fix them first.' }] }));
    applyAskItem(ctx.db, { kind: 'call', id: 'KET-48', issues: [], forSession: null, actor: 'z-kettle' }, item, question);
  };
  fileRound('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');
  recordConsoleAnswer(ctx.db, { id: 'KET-48', option: 'Go', note: '', actor: 'owner' });
  await ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'call:KET-48', note: 'Ship it.' });
  fileRound('b9c8d7e6f5a40312213f4e5d6c7b8a9087654321');
  recordConsoleAnswer(ctx.db, { id: 'KET-48', option: 'Go', note: '', actor: 'owner' });

  await ctx.asOther(ctx.headAt('b9c8d7e6f5a40312213f4e5d6c7b8a9087654321'), 'override', ['widgets', '7'], { source: 'call:KET-48', note: 'Ship it again.' });

  expect(ctx.db.query("SELECT json_extract(data, '$.head') AS head FROM events WHERE action = 'pr-override' ORDER BY seq").all()).toStrictEqual([{ head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }, { head: 'b9c8d7e6f5a40312213f4e5d6c7b8a9087654321' }]);
});

test('it refuses a call: source whose answer picks a grant label the call showed before it was re-asked as free text', async () => {
  const ctx = setupTest();
  applyAskItem(ctx.db, { kind: 'call', id: 'KET-47', issues: [], forSession: null, actor: 'z-kettle' }, parseItemInput('call', JSON.stringify({ title: 'Override widgets#7?', question: 'Merge past the findings?', options: [{ label: 'Go', effect: 'Merge it.', grants: { action: 'override', pr: 'zgeoff/widgets#7' } }, { label: 'Wait', effect: 'Fix them first.' }] })), 'Merge past the findings?');
  recordConsoleAnswer(ctx.db, { id: 'KET-47', option: 'Wait', note: '', actor: 'owner' });
  ctx.refileCall('KET-47', 'Override widgets#7?');
  recordConsoleAnswer(ctx.db, { id: 'KET-47', option: '', note: 'Go', actor: 'owner' });

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'call:KET-47', note: 'Ship it.' })).rejects.toMatchObject({ code: 'bad_args', message: '--source refused: call:KET-47 has no option that grants the override: an override needs the owner to pick an option whose grants name the PR and the head, and a plain yes names no head; ask z-stu to record it' });
  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-override'").get()).toStrictEqual({ total: 0 });
});

test.each([
  ['no finding id', ['widgets', '7'], { source: 'chat:kettle-12', note: 'Ship it.' }],
  ['no note', ['widgets', '7', 'aaaa'], { source: 'chat:kettle-12' }],
])('it refuses accept-risk with %s', async (_case, rest, flags) => {
  const ctx = setupTest();

  await expect(ctx.asOwner(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'accept-risk', rest, flags)).rejects.toMatchObject({ code: 'bad_args' });
});

test('it refuses an owner answer with a chat: source from a session that is not the owner, and stores nothing', async () => {
  const ctx = setupTest();

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'answer', ['widgets', '7', 'lgtm'], { source: 'chat:kettle-12' })).rejects.toMatchObject({
    code: 'bad_args',
    message: '--source refused: a chat: source is accepted only from the session of the owner (z-stu), as atc finds the caller; this caller is not it; ask z-stu to record it',
  });
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM pr_status').get()).toStrictEqual({ total: 0 });
});

test('it takes a console: source that names the owner console review of this PR, stored by the console at the head now', async () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'unblock', 'review-9', 'console-review', 'console', null, null, { review: 'lgtm', note: null, facts: { title: 'Review widgets#7', issues: [], session: 'z-kettle', ref: 'https://github.com/zgeoff/widgets/pull/7' } });
  logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-answer', 'console', null, null, { answer: 'lgtm', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'console:review-9', note: null });

  const answered = await ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'answer', ['widgets', '7', 'lgtm'], { source: 'console:review-9' });

  expect(answered.text).toContain('answer: lgtm at a1b2c3d via console:review-9');
});

test.each([
  { case: 'names no console review', review: null, stored: null, why: 'console:review-9 names no owner review in the console' },
  { case: 'reviews another PR', review: { review: 'lgtm', note: null, facts: { title: 'Review teapots#7', issues: [], session: 'z-kettle', ref: 'https://github.com/zgeoff/teapots/pull/7' } }, stored: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', why: 'console:review-9 is not the owner\'s console review of zgeoff/widgets#7' },
  { case: 'has no PR on an older review', review: { review: 'lgtm', note: null }, stored: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', why: 'console:review-9 is not the owner\'s console review of zgeoff/widgets#7' },
  { case: 'gave another answer', review: { review: 'changes', note: 'Descale it.', facts: { title: 'Review widgets#7', issues: [], session: 'z-kettle', ref: 'https://github.com/zgeoff/widgets/pull/7' } }, stored: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', why: "the owner's console review console:review-9 is changes, not lgtm" },
  { case: 'was stored at an older head', review: { review: 'lgtm', note: null, facts: { title: 'Review widgets#7', issues: [], session: 'z-kettle', ref: 'https://github.com/zgeoff/widgets/pull/7' } }, stored: 'b9c8d7e6f5a40312213f4e5d6c7b8a9087654321', why: 'the console stored console:review-9 at no head or another head, not a1b2c3d, the head gh gives now' },
])('it refuses a console: source that $case, and stores nothing', async (row) => {
  const ctx = setupTest();
  if (row.review !== null) {
    logEvent(ctx.db, 'unblock', 'review-9', 'console-review', 'console', null, null, row.review);
  }
  if (row.stored !== null) {
    logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-answer', 'console', null, null, { answer: 'lgtm', head: row.stored, source: 'console:review-9', note: null });
  }

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'answer', ['widgets', '7', 'lgtm'], { source: 'console:review-9' })).rejects.toMatchObject({ code: 'bad_args', message: `--source refused: ${row.why}; ask z-stu to record it` });
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM pr_status').get()).toStrictEqual({ total: 0 });
});

test('it refuses a console: source written by a session other than the console, at the head now', async () => {
  const ctx = setupTest();
  logEvent(ctx.db, 'unblock', 'review-9', 'console-review', 'console', null, null, { review: 'lgtm', note: null, facts: { title: 'Review widgets#7', issues: [], session: 'z-kettle', ref: 'https://github.com/zgeoff/widgets/pull/7' } });
  logEvent(ctx.db, 'hq', 'pr:widgets#7', 'pr-answer', 'z-kettle', null, null, { answer: 'lgtm', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'console:review-9', note: null });

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'answer', ['widgets', '7', 'lgtm'], { source: 'console:review-9' })).rejects.toMatchObject({ code: 'bad_args' });
});

test('it takes a call: source the owner answered with a plain Yes on a call that names the PR', async () => {
  const ctx = setupTest();
  ctx.fileCall('KET-50', 'lgtm widgets#7?');
  ctx.answerInConsole('KET-50');

  const answered = await ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'answer', ['widgets', '7', 'lgtm'], { source: 'call:KET-50' });

  expect(answered.text).toContain('answer: lgtm at a1b2c3d via call:KET-50');
});

test.each([
  { case: 'that names another PR', title: 'lgtm teapots#7?', answer: true, why: 'call:KET-51 does not name zgeoff/widgets#7 in the title the owner answered' },
  { case: 'that the owner has not answered', title: 'lgtm widgets#7?', answer: false, why: "call:KET-51 has no owner answer for its current round, in the console or by `hq call answer` from the owner's session (z-stu), as atc finds the caller" },
])('it refuses a call: source $case, and stores nothing', async (row) => {
  const ctx = setupTest();
  ctx.fileCall('KET-51', row.title);
  if (row.answer) {
    ctx.answerInConsole('KET-51');
  }

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'answer', ['widgets', '7', 'lgtm'], { source: 'call:KET-51' })).rejects.toMatchObject({ code: 'bad_args', message: `--source refused: ${row.why}; ask z-stu to record it` });
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM pr_status').get()).toStrictEqual({ total: 0 });
});

test('it refuses a call: source for lgtm when the owner answered the call with something other than a plain Yes, and stores nothing', async () => {
  const ctx = setupTest();
  ctx.fileCall('KET-52', 'lgtm widgets#7?');
  recordConsoleAnswer(ctx.db, { id: 'KET-52', option: '', note: 'No', actor: 'owner' });

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'answer', ['widgets', '7', 'lgtm'], { source: 'call:KET-52' })).rejects.toMatchObject({ code: 'bad_args', message: '--source refused: the owner\'s answer to call:KET-52 is not a plain yes: "No"; ask z-stu to record it' });
  expect(ctx.db.query('SELECT COUNT(*) AS total FROM pr_status').get()).toStrictEqual({ total: 0 });
});

test('it records a CI check override at the head now, holding the head, source, note, scope and check', async () => {
  const ctx = setupTest();

  const recorded = await ctx.override(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), { source: 'chat:kettle-12', note: 'An intended infra change.', check: ['preview'] });

  expect(ctx.db.query("SELECT subject_id, actor, data FROM events WHERE action = 'pr-override'").all()).toStrictEqual([
    { subject_id: 'pr:widgets#7', actor: 'z-kettle', data: JSON.stringify({ head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-12', note: 'An intended infra change.', scope: 'ci-check', check: 'preview' }) },
  ]);
  expect(recorded.data).toStrictEqual({ ciOverride: { repo: 'widgets', pr: 7, head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-12', note: 'An intended infra change.', check: 'preview' } });
});

test.each([
  ['an empty --check', { source: 'chat:kettle-12', note: 'Rebased.', check: [''] }],
  ['a blank --check', { source: 'chat:kettle-12', note: 'Rebased.', check: ['  '] }],
  ['a padded --check', { source: 'chat:kettle-12', note: 'Rebased.', check: [' preview'] }],
  ['two --check values', { source: 'chat:kettle-12', note: 'Rebased.', check: ['preview', 'test'] }],
  ['no --note', { source: 'chat:kettle-12', check: ['preview'] }],
  ['no --source', { note: 'Rebased.', check: ['preview'] }],
  ['a session --source', { source: 'session:z-kettle', note: 'Rebased.', check: ['preview'] }],
])('it refuses a CI check override with %s, and records nothing', async (_case, flags) => {
  const ctx = setupTest();

  await expect(ctx.override(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), flags)).rejects.toMatchObject({ code: 'bad_args' });

  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-override'").get()).toStrictEqual({ total: 0 });
});

test('it refuses a CI check override from a caller that is not the owner session, and records nothing', async () => {
  const ctx = setupTest();

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'chat:kettle-12', note: 'Ship it.', check: ['preview'] })).rejects.toMatchObject({ code: 'bad_args' });

  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-override'").get()).toStrictEqual({ total: 0 });
});

test('it refuses a CI check override when gh cannot give the head, and records nothing', async () => {
  const ctx = setupTest();

  await expect(ctx.override(ctx.ghDown(), { source: 'chat:kettle-12', note: 'Rebased.', check: ['preview'] })).rejects.toMatchObject({ code: 'head_unreadable' });

  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-override'").get()).toStrictEqual({ total: 0 });
});

test('it shows a CI override at the head now, and not as the findings override', async () => {
  const ctx = setupTest();
  const head = ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');
  await ctx.answer(head, 'lgtm', { source: 'chat:kettle-1' });
  await ctx.override(head, { source: 'chat:kettle-2', note: 'An intended infra change.', check: ['preview'] });

  const shown = await ctx.status(head);

  expect(shown.text).toInclude('ci override: preview at a1b2c3d via chat:kettle-2 (2026-10-14T01:00:00Z): An intended infra change.');
  expect(shown.data).toStrictEqual({
    pr: {
      repo: 'widgets',
      pr: 7,
      head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      headKnown: true,
      gate: null,
      gateHead: null,
      gateAt: null,
      gateStale: false,
      answer: 'lgtm',
      answerHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      answerSource: 'chat:kettle-1',
      answerNote: null,
      answerAt: '2026-10-14T01:00:00Z',
      answerStale: false,
      next: null,
      nextAt: null,
      override: null,
      ciOverrides: [{ check: 'preview', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-2', note: 'An intended infra change.', at: '2026-10-14T01:00:00Z' }],
      reviewRecords: { mechanical: null, exemption: null },
      updatedAt: '2026-10-14T01:00:00Z',
    },
  });
});

test('it shows no CI override once the PR has a new head', async () => {
  const ctx = setupTest();
  const head = ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');
  await ctx.answer(head, 'lgtm', { source: 'chat:kettle-1' });
  await ctx.override(head, { source: 'chat:kettle-2', note: 'An intended infra change.', check: ['preview'] });

  const shown = await ctx.status(ctx.headAt('b9c8d7e6f5a40312213f4e5d6c7b8a9087654321'));

  expect(shown.data).toStrictEqual({
    pr: {
      repo: 'widgets',
      pr: 7,
      head: 'b9c8d7e6f5a40312213f4e5d6c7b8a9087654321',
      headKnown: true,
      gate: null,
      gateHead: null,
      gateAt: null,
      gateStale: false,
      answer: 'lgtm',
      answerHead: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      answerSource: 'chat:kettle-1',
      answerNote: null,
      answerAt: '2026-10-14T01:00:00Z',
      answerStale: true,
      next: null,
      nextAt: null,
      override: null,
      ciOverrides: [],
      reviewRecords: { mechanical: null, exemption: null },
      updatedAt: '2026-10-14T01:00:00Z',
    },
  });
  expect(shown.text).not.toInclude('ci override');
});

test('it shows a standing CI override for a PR with no record', async () => {
  const ctx = setupTest();
  const head = ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678');
  await ctx.override(head, { source: 'chat:kettle-2', note: 'An intended infra change.', check: ['preview'] });
  ctx.db.query('DELETE FROM pr_status').run();

  const shown = await ctx.status(head);

  expect(shown.text).toInclude('ci override: preview at a1b2c3d via chat:kettle-2');
  expect(shown.data).toStrictEqual({ pr: null, ciOverrides: [{ check: 'preview', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', source: 'chat:kettle-2', note: 'An intended infra change.', at: '2026-10-14T01:00:00Z' }] });
});

test.each(['console:KET-60', 'call:KET-60'])('it refuses a CI check override from %s even when the picked option grants an override of this PR at this head, and records nothing', async (source) => {
  const ctx = setupTest();
  ctx.fileGrantCall('KET-60', { action: 'override', pr: 'zgeoff/widgets#7', head: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' });

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source, note: 'An intended infra change.', check: ['preview'] })).rejects.toMatchObject({ code: 'bad_args', message: `--source refused: ${source} cannot override a CI check: only the owner's own chat source may, so the owner names the check in the command; ask z-stu to record it` });

  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-override'").get()).toStrictEqual({ total: 0 });
});

test('it refuses a CI check override from a call: source with a plain Yes, and records nothing', async () => {
  const ctx = setupTest();
  ctx.fileCall('KET-62', 'Override widgets#7 preview check?');
  ctx.answerInConsole('KET-62');

  await expect(ctx.asOther(ctx.headAt('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'), 'override', ['widgets', '7'], { source: 'call:KET-62', note: 'Ship it.', check: ['preview'] })).rejects.toMatchObject({ code: 'bad_args', message: expect.stringContaining('call:KET-62 cannot override a CI check') });

  expect(ctx.db.query("SELECT COUNT(*) AS total FROM events WHERE action = 'pr-override'").get()).toStrictEqual({ total: 0 });
});
