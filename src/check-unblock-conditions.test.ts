import { expect, mock, onTestFinished, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { LINEAR_GRAPHQL_URL, linearDocuments, linearIssues } from '../mocks/linear-handlers.ts';
import { server } from '../mocks/node.ts';
import { NOON_SYDNEY, at, freshDb } from '../test/helpers.ts';
import { buildStubReleaseGH } from '../test/build-stub-release-gh.ts';
import { createUnblockItems } from '../test/create-unblock-items.ts';
import { makePRStateGh } from '../test/make-pr-state-gh.ts';
import { checkUnblockConditions } from './check-unblock-conditions.ts';
import { overrideEnv } from './config/override-env.ts';
import { makeLinearCaller } from './linear/make-linear-caller.ts';
import { resetKey } from './linear/reset-key.ts';
import type { Runner } from './runner/types.ts';
import { addUnblock } from './unblock/add-unblock.ts';
import { closeUnblock } from './unblock/close-unblock.ts';
import { getUnblock } from './unblock/get-unblock.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  resetKey();
  onTestFinished(resetKey);
  onTestFinished(overrideEnv('OP_SERVICE_ACCOUNT_TOKEN', 'invented-token'));
  return { db: fresh.db, call: makeLinearCaller(() => Promise.resolve({ code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' })) };
}

test('it drops an item whose subject PR merged or closed, with a note and no message to anyone', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, {
    'review-4': { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] },
    'review-5': { task: 'Review kettle#5 and say lgtm', links: [{ label: 'kettle#5', url: 'https://github.com/kettle-co/kettle/pull/5', subject: true }] },
    'review-6': { task: 'Review kettle#6 and say lgtm', links: [{ label: 'kettle#6', url: 'https://github.com/kettle-co/kettle/pull/6', subject: true }] },
  });
  const run = makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED', 'kettle-co/kettle#5': 'CLOSED', 'kettle-co/kettle#6': 'OPEN' } });

  const outcome = await checkUnblockConditions(ctx.db, { run, call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: ['review-4', 'review-5'], errors: [], overdue: [] });
  expect(getUnblock(ctx.db, 'review-4')?.state).toBe('dropped');
  expect(getUnblock(ctx.db, 'review-4')?.note).toBe('kettle-co/kettle#4 merged on GitHub');
  expect(getUnblock(ctx.db, 'review-5')?.note).toBe('kettle-co/kettle#5 closed on GitHub');
  expect(getUnblock(ctx.db, 'review-6')?.state).toBe('open');
  expect(ctx.db.query('SELECT count(*) AS total FROM outbox').get()).toStrictEqual({ total: 0 });
});

test('it never drops an item whose PR is linked only as context, and asks GitHub nothing', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  createUnblockItems(ctx.db, {
    'approve-app': { task: 'Approve the invented kettle app', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4' }] },
    plain: { task: 'Run the steam test' },
  });
  const run = makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' }, calls });

  const outcome = await checkUnblockConditions(ctx.db, { run, call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [], overdue: [] });
  expect(calls).toStrictEqual([]);
  expect(getUnblock(ctx.db, 'approve-app')?.state).toBe('open');
});

test('it keeps an item open and reports it when its subject PR cannot be read', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { lost: { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: ["lost: can't read kettle-co/kettle#4 (gh exit 1): invented: no such PR"], overdue: [] });
  expect(getUnblock(ctx.db, 'lost')?.state).toBe('open');
});

test('it keeps open an item that was closed and reopened while GitHub was read, and reports it', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { review: { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } });
  const github = makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' } });
  const run: Runner = (cmd, opts) => {
    closeUnblock(ctx.db, 'review', 'done', null, 'z-stu');
    createUnblockItems(ctx.db, { review: { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } });
    return github(cmd, opts);
  };

  const outcome = await checkUnblockConditions(ctx.db, { run, call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: ['review: unblock item review was closed and reopened while its conditions were read; the next pass checks it again'], overdue: [] });
  expect(getUnblock(ctx.db, 'review')?.state).toBe('open');
});

test('it keeps open a review that a re-add replaced with a new task while GitHub was read, and reports it', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { review: { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } });
  const github = makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' } });
  const run: Runner = (cmd, opts) => {
    addUnblock(ctx.db, { id: 'review', task: 'Run the live check on the new kettle', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage' });
    return github(cmd, opts);
  };

  const outcome = await checkUnblockConditions(ctx.db, { run, call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: ['review: unblock item review changed while its conditions were read; the next pass checks it again'], overdue: [] });
  expect(getUnblock(ctx.db, 'review')).toMatchObject({ state: 'open', task: 'Run the live check on the new kettle' });
});

test('it keeps a dropped review item open once a plain re-add reopens it with a new task', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { review: { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } });
  const deps = { run: makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' } }), call: ctx.call, ownerSession: 'kettle-owner' };
  await checkUnblockConditions(ctx.db, deps, 'kettle-bot');
  addUnblock(ctx.db, { id: 'review', task: 'Run the live check on the new kettle', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage' });

  const outcome = await checkUnblockConditions(ctx.db, deps, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [], overdue: [] });
  expect(getUnblock(ctx.db, 'review')?.state).toBe('open');
});

test('it keeps an open review item open once a plain re-add gives it a new task', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { review: { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } });
  addUnblock(ctx.db, { id: 'review', task: 'Descale the kettle', minutes: null, unblocks: [], notify: ['kettle-session'], actor: 'kettle-triage' });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' } }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [], overdue: [] });
  expect(getUnblock(ctx.db, 'review')?.item).toBeNull();
});

test('it keeps an open review item open once a plain re-add repeats its task', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { review: { task: 'Descale the kettle', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } });
  addUnblock(ctx.db, { id: 'review', task: 'Descale the kettle', minutes: null, unblocks: [], notify: ['kettle-session'], actor: 'kettle-triage' });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' } }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [], overdue: [] });
  expect(getUnblock(ctx.db, 'review')?.item).toBeNull();
});

test.each([
  ['completed', 'Done'],
  ['canceled', 'Canceled'],
])('it closes an item as done when its issue is %s, and tells the session that added it', async (type, word) => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] } });
  linearIssues.push({ identifier: 'KET-7', team: 'KET', state: word, stateType: type, previousIdentifiers: [], project: null, labels: [], parent: null });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['steam-test'], dropped: [], errors: [], overdue: [] });
  expect(getUnblock(ctx.db, 'steam-test')?.state).toBe('done');
  expect(getUnblock(ctx.db, 'steam-test')?.note).toBe(`settled: issue:KET-7 ${word}`);
  expect(ctx.db.query('SELECT target, text FROM outbox ORDER BY target').all()).toStrictEqual([
    { target: 'kettle-session', text: `"Run the steam test" is closed, settled: issue:KET-7 ${word}. That unblocks your work. Carry on.` },
    { target: 'kettle-triage', text: `"Run the steam test" is closed, settled: issue:KET-7 ${word}. That unblocks your work. Carry on.` },
  ]);
});

test('it leaves an item open and sends nothing while its issue is in progress', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] } });
  linearIssues.push({ identifier: 'KET-7', team: 'KET', state: 'In Progress', stateType: 'started', previousIdentifiers: [], project: null, labels: [], parent: null });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [], overdue: [] });
  expect(getUnblock(ctx.db, 'steam-test')?.state).toBe('open');
  expect(ctx.db.query('SELECT count(*) AS total FROM outbox').get()).toStrictEqual({ total: 0 });
});

test('it asks Linear once for every issue named by every item', async () => {
  const ctx = setupTest();
  const asked = mock<(body: unknown) => void>();
  createUnblockItems(ctx.db, {
    first: { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] },
    second: {
      task: 'Descale the kettle',
      doneWhen: [
        { kind: 'issue', ref: 'KET-7' },
        { kind: 'issue', ref: 'KET-8' },
      ],
    },
  });
  server.use(
    http.post(LINEAR_GRAPHQL_URL, async (info) => {
      const body: unknown = await info.request.clone().json();
      asked(body);
    }),
  );

  await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(asked.mock.calls).toStrictEqual([[{ query: expect.any(String), variables: { ids: ['KET-7', 'KET-8'] } }]]);
});

test('it asks Linear in batches of 100 issues and settles an item whose issue is in the second batch', async () => {
  const ctx = setupTest();
  const asked = mock<(body: unknown) => void>();
  const numbers = Array.from({ length: 101 }, (_, index) => index + 1);
  createUnblockItems(ctx.db, Object.fromEntries(numbers.map((number) => [`kettle-${number}`, { task: `Descale kettle ${number}`, doneWhen: [{ kind: 'issue', ref: `KET-${number}` }] }])));
  for (const number of numbers) {
    const done = number === 101;
    linearIssues.push({ identifier: `KET-${number}`, team: 'KET', state: done ? 'Done' : 'In Progress', stateType: done ? 'completed' : 'started', previousIdentifiers: [], project: null, labels: [], parent: null });
  }
  server.use(
    http.post(LINEAR_GRAPHQL_URL, async (info) => {
      const body: unknown = await info.request.clone().json();
      asked(body);
    }),
  );

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['kettle-101'], dropped: [], errors: [], overdue: [] });
  expect(getUnblock(ctx.db, 'kettle-101')?.note).toBe('settled: issue:KET-101 Done');
  expect(asked.mock.calls).toStrictEqual([
    [{ query: expect.any(String), variables: { ids: numbers.slice(0, 100).map((number) => `KET-${number}`) } }],
    [{ query: expect.any(String), variables: { ids: ['KET-101'] } }],
  ]);
});

test.each([
  ['PR merged', 'MERGED', 'merged'],
  ['PR closed', 'CLOSED', 'closed'],
])('it closes an item as done when its %s', async (_label, state, word) => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'merge-app': { task: 'Merge the invented kettle app', doneWhen: [{ kind: 'pr', ref: 'kettle-co/kettle#4' }] } });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: { 'kettle-co/kettle#4': state } }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['merge-app'], dropped: [], errors: [], overdue: [] });
  expect(getUnblock(ctx.db, 'merge-app')?.state).toBe('done');
  expect(getUnblock(ctx.db, 'merge-app')?.note).toBe(`settled: pr:kettle-co/kettle#4 ${word}`);
});

test.each([
  ['Status: decided', 'Status: decided'],
  ['a first line that starts with it', 'Status: decided on 3 Mar 2026. The board approved the invented descaling plan.'],
  ['another case', 'STATUS: Decided'],
  ['blank lines before it', '\n\n  Status: decided\nThe board approved it.'],
])('it closes an item as done when its document reads %s', async (_label, content) => {
  const ctx = setupTest();
  const asked = mock<(body: unknown) => void>();
  createUnblockItems(ctx.db, { 'descale-plan': { task: 'Approve the descaling plan', doneWhen: [{ kind: 'doc', ref: 'descaling-plan-abc123def456' }] } });
  linearDocuments.push({ id: '5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10', slugID: 'abc123def456', content });
  server.use(
    http.post(LINEAR_GRAPHQL_URL, async (info) => {
      const body: unknown = await info.request.clone().json();
      asked(body);
    }),
  );

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['descale-plan'], dropped: [], errors: [], overdue: [] });
  expect(getUnblock(ctx.db, 'descale-plan')?.note).toBe('settled: doc:descaling-plan-abc123def456 decided');
  expect(asked.mock.calls).toStrictEqual([[{ query: expect.any(String), variables: { slugID: 'abc123def456' } }]]);
});

test('it closes an item as done when the document its ID names reads Status: decided, and tells the session that added it', async () => {
  const ctx = setupTest();
  const asked = mock<(body: unknown) => void>();
  createUnblockItems(ctx.db, { 'descale-plan': { task: 'Approve the descaling plan', doneWhen: [{ kind: 'doc', ref: '5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10' }] } });
  linearDocuments.push({ id: '5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10', slugID: 'abc123def456', content: 'Status: decided\nThe board approved the invented descaling plan.' });
  server.use(
    http.post(LINEAR_GRAPHQL_URL, async (info) => {
      const body: unknown = await info.request.clone().json();
      asked(body);
    }),
  );

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['descale-plan'], dropped: [], errors: [], overdue: [] });
  expect(getUnblock(ctx.db, 'descale-plan')?.state).toBe('done');
  expect(getUnblock(ctx.db, 'descale-plan')?.note).toBe('settled: doc:5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10 decided');
  expect(asked.mock.calls).toStrictEqual([[{ query: expect.any(String), variables: { id: '5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10' } }]]);
  expect(ctx.db.query('SELECT target, text FROM outbox ORDER BY target').all()).toStrictEqual([
    { target: 'kettle-session', text: '"Approve the descaling plan" is closed, settled: doc:5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10 decided. That unblocks your work. Carry on.' },
    { target: 'kettle-triage', text: '"Approve the descaling plan" is closed, settled: doc:5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10 decided. That unblocks your work. Carry on.' },
  ]);
});

test.each([
  ['it reads Status: proposed', 'Status: proposed\nThe board has not decided.'],
  ['Status: decided is only on a later line', '# Descaling plan\nStatus: decided'],
  ['it is empty', ''],
])('it leaves an item open when its document %s', async (_label, content) => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'descale-plan': { task: 'Approve the descaling plan', doneWhen: [{ kind: 'doc', ref: 'abc123def456' }] } });
  linearDocuments.push({ id: '5d6f1a52-8c3e-4b1f-9a77-0c2e4d6b8a10', slugID: 'abc123def456', content });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [], overdue: [] });
  expect(getUnblock(ctx.db, 'descale-plan')?.state).toBe('open');
});

test('it closes an item when the second of its two conditions settles', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, {
    'steam-test': {
      task: 'Run the steam test',
      doneWhen: [
        { kind: 'issue', ref: 'KET-7' },
        { kind: 'pr', ref: 'kettle-co/kettle#4' },
      ],
    },
  });
  linearIssues.push({ identifier: 'KET-7', team: 'KET', state: 'In Progress', stateType: 'started', previousIdentifiers: [], project: null, labels: [], parent: null });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' } }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['steam-test'], dropped: [], errors: [], overdue: [] });
  expect(getUnblock(ctx.db, 'steam-test')?.note).toBe('settled: pr:kettle-co/kettle#4 merged');
});

test('it keeps an item open and reports it when Linear fails, and still settles a PR condition in the same pass', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, {
    'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] },
    'merge-app': { task: 'Merge the invented kettle app', doneWhen: [{ kind: 'pr', ref: 'kettle-co/kettle#4' }] },
  });
  server.use(http.post(LINEAR_GRAPHQL_URL, () => HttpResponse.json({ errors: [{ message: 'invented: Linear is down' }] }, { status: 500 })));

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' } }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['merge-app'], dropped: [], errors: ["steam-test: can't read issue:KET-7: Linear answered 500: invented: Linear is down"], overdue: [] });
  expect(getUnblock(ctx.db, 'steam-test')?.state).toBe('open');
});

test('it reports an issue Linear does not know and leaves its item open', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-9' }] } });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: ['steam-test: Linear has no issue KET-9'], overdue: [] });
  expect(getUnblock(ctx.db, 'steam-test')?.state).toBe('open');
});

test('it reports a PR whose gh answer has an unexpected shape and leaves its item open', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'merge-app': { task: 'Merge the invented kettle app', doneWhen: [{ kind: 'pr', ref: 'kettle-co/kettle#4' }] } });
  const answer = { code: 0, stdout: 'invented: not JSON', stderr: '' };

  const outcome = await checkUnblockConditions(ctx.db, { run: () => Promise.resolve(answer), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: ["merge-app: gh's answer for kettle-co/kettle#4 has an unexpected shape"], overdue: [] });
});

test('it reports a stored PR condition with no owner and asks gh nothing', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  createUnblockItems(ctx.db, { 'merge-app': { task: 'Merge the invented kettle app', doneWhen: [{ kind: 'pr', ref: 'kettle#4' }] } });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {}, calls }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: ['merge-app: cannot read pr:kettle#4 as owner/repo#n'], overdue: [] });
  expect(calls).toStrictEqual([]);
});

test('it settles an issue that moved to another team by the identifier it was filed under', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] } });
  linearIssues.push({ identifier: 'TEA-3', team: 'TEA', state: 'Done', stateType: 'completed', previousIdentifiers: ['KET-7'], project: null, labels: [], parent: null });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['steam-test'], dropped: [], errors: [], overdue: [] });
  expect(getUnblock(ctx.db, 'steam-test')?.note).toBe('settled: issue:KET-7 Done');
});

test('it closes an item as done, not dropped, when its condition and its subject PR both settled', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, {
    review: { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }], doneWhen: [{ kind: 'issue', ref: 'KET-7' }] },
  });
  linearIssues.push({ identifier: 'KET-7', team: 'KET', state: 'Done', stateType: 'completed', previousIdentifiers: [], project: null, labels: [], parent: null });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' } }), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['review'], dropped: [], errors: [], overdue: [] });
});

test('a release watch tells its sessions once, when a release newer than the watch appears', async () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'kettle-release', task: 'Live-check the kettle release', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage', kind: 'watch', doneWhen: [{ kind: 'release', ref: 'kettle-co/kettle' }] });
  const older = { tag_name: 'v1.1.0', draft: false, prerelease: false, published_at: '2026-10-10T00:00:00Z' };
  const newer = { tag_name: 'v1.2.0', draft: false, prerelease: false, published_at: '2026-10-14T03:00:00Z' };
  const before = await checkUnblockConditions(ctx.db, { run: buildStubReleaseGH({ 'kettle-co/kettle': [older] }, []), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  const fired = await checkUnblockConditions(ctx.db, { run: buildStubReleaseGH({ 'kettle-co/kettle': [newer, older] }, []), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');
  const after = await checkUnblockConditions(ctx.db, { run: buildStubReleaseGH({ 'kettle-co/kettle': [newer, older] }, []), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(before).toStrictEqual({ settled: [], dropped: [], errors: [], overdue: [] });
  expect(fired).toStrictEqual({ settled: ['kettle-release'], dropped: [], errors: [], overdue: [] });
  expect(after).toStrictEqual({ settled: [], dropped: [], errors: [], overdue: [] });
  expect(ctx.db.query('SELECT target, text FROM outbox ORDER BY target').all()).toStrictEqual([
    { target: 'kettle-qa', text: 'Watch "Live-check the kettle release" (unblock kettle-release) is met, settled: release:kettle-co/kettle released v1.2.0. It is closed: do what it waited for.' },
    { target: 'kettle-triage', text: 'Watch "Live-check the kettle release" (unblock kettle-release) is met, settled: release:kettle-co/kettle released v1.2.0. It is closed: do what it waited for.' },
  ]);
});

test("a settled watch tells the owner's session when its --notify names it, and an owner item does not", async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_OWNER', 'kettle-owner'));
  addUnblock(ctx.db, { id: 'steam-watch', task: 'Check the steam log', minutes: null, unblocks: [], notify: ['kettle-owner'], actor: 'kettle-triage', kind: 'watch', doneWhen: [{ kind: 'date', ref: '2026-10-14T00:00:00Z' }] });
  addUnblock(ctx.db, { id: 'steam-todo', task: 'Wipe the steam vent', minutes: null, unblocks: [], notify: ['kettle-owner'], actor: 'kettle-triage', doneWhen: [{ kind: 'date', ref: '2026-10-14T00:00:00Z' }] });

  await checkUnblockConditions(ctx.db, { run: buildStubReleaseGH({}, []), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(ctx.db.query("SELECT text FROM outbox WHERE target = 'kettle-owner'").all()).toStrictEqual([
    { text: 'Watch "Check the steam log" (unblock steam-watch) is met, settled: date:2026-10-14T00:00:00Z passed. It is closed: do what it waited for.' },
  ]);
});

test('a release watch leaves out drafts and prereleases', async () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'kettle-release', task: 'Live-check the kettle release', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage', kind: 'watch', doneWhen: [{ kind: 'release', ref: 'kettle-co/kettle' }] });
  const run = buildStubReleaseGH(
    {
      'kettle-co/kettle': [
        { tag_name: 'v1.3.0-rc.1', draft: false, prerelease: true, published_at: '2026-10-14T03:00:00Z' },
        { tag_name: 'v1.3.0', draft: true, prerelease: false, published_at: null },
      ],
    },
    [],
  );

  const outcome = await checkUnblockConditions(ctx.db, { run, call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [], overdue: [] });
});

test('a release watch stays open and reports it when the release list cannot be read', async () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'teapot-release', task: 'Live-check the teapot release', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage', kind: 'watch', doneWhen: [{ kind: 'release', ref: 'kettle-co/teapot' }] });

  const outcome = await checkUnblockConditions(ctx.db, { run: buildStubReleaseGH({}, []), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: ['teapot-release: releases of kettle-co/teapot failed (1): gh: Not Found (HTTP 404)'], overdue: [] });
  expect(getUnblock(ctx.db, 'teapot-release')?.state).toBe('open');
});

test('a date condition settles once, at its time', async () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'steam-date', task: 'Check the steam log after the weekend', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage', kind: 'watch', doneWhen: [{ kind: 'date', ref: '2026-10-14T02:00:00Z' }] });
  const before = await checkUnblockConditions(ctx.db, { run: buildStubReleaseGH({}, []), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot', new Date('2026-10-14T01:59:59Z'));

  const fired = await checkUnblockConditions(ctx.db, { run: buildStubReleaseGH({}, []), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot', new Date('2026-10-14T02:00:00Z'));
  const after = await checkUnblockConditions(ctx.db, { run: buildStubReleaseGH({}, []), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot', new Date('2026-10-14T02:10:00Z'));

  expect(before.settled).toStrictEqual([]);
  expect(fired.settled).toStrictEqual(['steam-date']);
  expect(after.settled).toStrictEqual([]);
  expect(getUnblock(ctx.db, 'steam-date')?.note).toBe('settled: date:2026-10-14T02:00:00Z passed');
  expect(ctx.db.query("SELECT count(*) AS total FROM outbox WHERE target = 'kettle-qa'").get()).toStrictEqual({ total: 1 });
});

test('an item past its deadline tells the adder, the notify session and the owner session once', async () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'kettle-release', task: 'Live-check the kettle release', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage', kind: 'watch', deadline: '2026-10-14T00:30:00Z', doneWhen: [{ kind: 'release', ref: 'kettle-co/kettle' }] });
  const run = buildStubReleaseGH({ 'kettle-co/kettle': [] }, []);

  const first = await checkUnblockConditions(ctx.db, { run, call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');
  const second = await checkUnblockConditions(ctx.db, { run, call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(first.overdue).toStrictEqual(['kettle-release']);
  expect(second.overdue).toStrictEqual([]);
  const text = '"Live-check the kettle release" (unblock kettle-release) is overdue: its deadline 2026-10-14T00:30:00Z passed and release:kettle-co/kettle has not happened.';
  expect(ctx.db.query('SELECT target, text FROM outbox ORDER BY target').all()).toStrictEqual([
    { target: 'kettle-owner', text },
    { target: 'kettle-qa', text },
    { target: 'kettle-triage', text },
  ]);
  expect(getUnblock(ctx.db, 'kettle-release')?.overdue_told_at).toBe('2026-10-14T01:00:00Z');
});

test('an item whose deadline has not passed tells no one', async () => {
  const ctx = setupTest();
  addUnblock(ctx.db, { id: 'kettle-release', task: 'Live-check the kettle release', minutes: null, unblocks: [], notify: ['kettle-qa'], actor: 'kettle-triage', kind: 'watch', deadline: '2026-10-14T01:30:00Z', doneWhen: [{ kind: 'release', ref: 'kettle-co/kettle' }] });

  const outcome = await checkUnblockConditions(ctx.db, { run: buildStubReleaseGH({ 'kettle-co/kettle': [] }, []), call: ctx.call, ownerSession: 'kettle-owner' }, 'kettle-bot');

  expect(outcome.overdue).toStrictEqual([]);
  expect(ctx.db.query('SELECT count(*) AS total FROM outbox').get()).toStrictEqual({ total: 0 });
});
