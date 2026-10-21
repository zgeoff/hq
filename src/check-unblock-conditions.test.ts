import { expect, mock, onTestFinished, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { LINEAR_GRAPHQL_URL, linearDocuments, linearIssues } from '../mocks/linear-handlers.ts';
import { server } from '../mocks/node.ts';
import { NOON_SYDNEY, at, freshDb } from '../test/helpers.ts';
import { createUnblockItems } from '../test/create-unblock-items.ts';
import { makePRStateGh } from '../test/make-pr-state-gh.ts';
import { checkUnblockConditions } from './check-unblock-conditions.ts';
import { overrideEnv } from './config/override-env.ts';
import { makeLinearCaller } from './linear/make-linear-caller.ts';
import { resetKey } from './linear/reset-key.ts';
import { addUnblock } from './unblock/add-unblock.ts';
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

  const outcome = await checkUnblockConditions(ctx.db, { run, call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: ['review-4', 'review-5'], errors: [] });
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

  const outcome = await checkUnblockConditions(ctx.db, { run, call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [] });
  expect(calls).toStrictEqual([]);
  expect(getUnblock(ctx.db, 'approve-app')?.state).toBe('open');
});

test('it keeps an item open and reports it when its subject PR cannot be read', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { lost: { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: ["lost: can't read kettle-co/kettle#4 (gh exit 1): invented: no such PR"] });
  expect(getUnblock(ctx.db, 'lost')?.state).toBe('open');
});

test('it keeps a dropped review item open once a plain re-add reopens it with a new task', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { review: { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } });
  const deps = { run: makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' } }), call: ctx.call };
  await checkUnblockConditions(ctx.db, deps, 'kettle-bot');
  addUnblock(ctx.db, { id: 'review', task: 'Run the live check on the new kettle', minutes: null, unblocks: [], notify: [], actor: 'kettle-triage' });

  const outcome = await checkUnblockConditions(ctx.db, deps, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [] });
  expect(getUnblock(ctx.db, 'review')?.state).toBe('open');
});

test('it keeps an open review item open once a plain re-add gives it a new task', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { review: { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } });
  addUnblock(ctx.db, { id: 'review', task: 'Descale the kettle', minutes: null, unblocks: [], notify: ['kettle-session'], actor: 'kettle-triage' });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' } }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [] });
  expect(getUnblock(ctx.db, 'review')?.item).toBeNull();
});

test('it keeps an open review item open once a plain re-add repeats its task', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { review: { task: 'Descale the kettle', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }] } });
  addUnblock(ctx.db, { id: 'review', task: 'Descale the kettle', minutes: null, unblocks: [], notify: ['kettle-session'], actor: 'kettle-triage' });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' } }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [] });
  expect(getUnblock(ctx.db, 'review')?.item).toBeNull();
});

test.each([
  ['completed', 'Done'],
  ['canceled', 'Canceled'],
])('it closes an item as done when its issue is %s, and tells the session that added it', async (type, word) => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] } });
  linearIssues.push({ identifier: 'KET-7', team: 'KET', state: word, stateType: type, previousIdentifiers: [], project: null, labels: [], parent: null });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['steam-test'], dropped: [], errors: [] });
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

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [] });
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

  await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call }, 'kettle-bot');

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

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['kettle-101'], dropped: [], errors: [] });
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

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: { 'kettle-co/kettle#4': state } }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['merge-app'], dropped: [], errors: [] });
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

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['descale-plan'], dropped: [], errors: [] });
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

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['descale-plan'], dropped: [], errors: [] });
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

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: [] });
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

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' } }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['steam-test'], dropped: [], errors: [] });
  expect(getUnblock(ctx.db, 'steam-test')?.note).toBe('settled: pr:kettle-co/kettle#4 merged');
});

test('it keeps an item open and reports it when Linear fails, and still settles a PR condition in the same pass', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, {
    'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] },
    'merge-app': { task: 'Merge the invented kettle app', doneWhen: [{ kind: 'pr', ref: 'kettle-co/kettle#4' }] },
  });
  server.use(http.post(LINEAR_GRAPHQL_URL, () => HttpResponse.json({ errors: [{ message: 'invented: Linear is down' }] }, { status: 500 })));

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' } }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['merge-app'], dropped: [], errors: ["steam-test: can't read issue:KET-7: Linear answered 500: invented: Linear is down"] });
  expect(getUnblock(ctx.db, 'steam-test')?.state).toBe('open');
});

test('it reports an issue Linear does not know and leaves its item open', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-9' }] } });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: ['steam-test: Linear has no issue KET-9'] });
  expect(getUnblock(ctx.db, 'steam-test')?.state).toBe('open');
});

test('it reports a PR whose gh answer has an unexpected shape and leaves its item open', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'merge-app': { task: 'Merge the invented kettle app', doneWhen: [{ kind: 'pr', ref: 'kettle-co/kettle#4' }] } });
  const answer = { code: 0, stdout: 'invented: not JSON', stderr: '' };

  const outcome = await checkUnblockConditions(ctx.db, { run: () => Promise.resolve(answer), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: ["merge-app: gh's answer for kettle-co/kettle#4 has an unexpected shape"] });
});

test('it reports a stored PR condition with no owner and asks gh nothing', async () => {
  const ctx = setupTest();
  const calls: string[] = [];
  createUnblockItems(ctx.db, { 'merge-app': { task: 'Merge the invented kettle app', doneWhen: [{ kind: 'pr', ref: 'kettle#4' }] } });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {}, calls }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: [], dropped: [], errors: ['merge-app: cannot read pr:kettle#4 as owner/repo#n'] });
  expect(calls).toStrictEqual([]);
});

test('it settles an issue that moved to another team by the identifier it was filed under', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, { 'steam-test': { task: 'Run the steam test', doneWhen: [{ kind: 'issue', ref: 'KET-7' }] } });
  linearIssues.push({ identifier: 'TEA-3', team: 'TEA', state: 'Done', stateType: 'completed', previousIdentifiers: ['KET-7'], project: null, labels: [], parent: null });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: {} }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['steam-test'], dropped: [], errors: [] });
  expect(getUnblock(ctx.db, 'steam-test')?.note).toBe('settled: issue:KET-7 Done');
});

test('it closes an item as done, not dropped, when its condition and its subject PR both settled', async () => {
  const ctx = setupTest();
  createUnblockItems(ctx.db, {
    review: { task: 'Review kettle#4 and say lgtm', links: [{ label: 'kettle#4', url: 'https://github.com/kettle-co/kettle/pull/4', subject: true }], doneWhen: [{ kind: 'issue', ref: 'KET-7' }] },
  });
  linearIssues.push({ identifier: 'KET-7', team: 'KET', state: 'Done', stateType: 'completed', previousIdentifiers: [], project: null, labels: [], parent: null });

  const outcome = await checkUnblockConditions(ctx.db, { run: makePRStateGh({ states: { 'kettle-co/kettle#4': 'MERGED' } }), call: ctx.call }, 'kettle-bot');

  expect(outcome).toStrictEqual({ settled: ['review'], dropped: [], errors: [] });
});
