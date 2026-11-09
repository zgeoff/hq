import { expect, mock, onTestFinished, test } from 'bun:test';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import type { StubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { freshDb } from '../../test/helpers.ts';
import { waitFor } from '../../test/wait-for.ts';
import { overrideEnv } from '../config/override-env.ts';
import { listNews } from '../news/list-news.ts';
import { readEvents } from '../read-events.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { endHandedInRunSessions } from './end-handed-in-run-sessions.ts';
import { finalPr } from './final-pr.ts';
import { getRun } from './get-run.ts';
import type { WrapUpDeps } from './run-wrap-up.ts';
import { setSession } from './set-session.ts';
import { setState } from './set-state.ts';
import { viewRun } from './view-run.ts';
import { wrapUpMergedRuns } from './wrap-up-merged-runs.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);

  return {
    db: fresh.db,
    readEvents: (...actions: string[]) => readEvents(fresh.db, 'run', 'GEO-9901', actions),
    readActions: (...actions: string[]) => readEvents(fresh.db, 'run', 'GEO-9901', actions).map((event) => event.action),

    readNews: () => listNews(fresh.db, { all: true, limit: 10 }).map((item) => item.text),
    sweep: (fleet: StubFleetClient, activity: [string, number | null][], readLocalWork: WrapUpDeps['readLocalWork'] = () => Promise.resolve({ state: 'pushed' })) =>
      endHandedInRunSessions(
        fresh.db,
        { readActivity: (id) => Promise.resolve(new Map(activity.map(([session, last]) => [session, { lastActivityAt: last, pendingMessage: null }])).get(id) ?? null) },
        { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork },
        { actor: 'z-delivery' },
      ),
    readState: () => getRun(fresh.db, 'GEO-9901')?.state,
    readSessions: () => {
      const run = getRun(fresh.db, 'GEO-9901');
      return run === null
        ? []
        : viewRun(fresh.db, run)
            .sessions.map((session) => ({ session_id: session.session_id, active: session.active, ended_at: session.ended_at, ended_by: session.ended_by }))
            .toSorted((left, right) => left.session_id.localeCompare(right.session_id));
    },
  };
}

test('it ends the sessions of a handed-in run, helpers included, and moves the run to merged', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } },
      { id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } },
    ],
  });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  setSession(ctx.db, 'GEO-9901', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');

  const ended = await ctx.sweep(
    fleet,
    [
      ['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
      ['0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
    ],
  );

  expect(ended).toBe(2);
  expect(ctx.readSessions()).toStrictEqual([
    { session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 0, ended_at: '2026-10-22T12:00:00Z', ended_by: 'sweep' },
    { session_id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 0, ended_at: '2026-10-22T12:00:00Z', ended_by: 'sweep' },
  ]);
  expect(ctx.readState()).toBe('merged');
  expect(fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001', 'unpin 0000e002', 'kill 0000e002', 'unpin 0000e002', 'forget 0000e002']);
  expect(ctx.readEvents('handed-in-ended').map((event) => event.data)).toStrictEqual([JSON.stringify({ sessions: ['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] })]);
});

test('it ends a handed-in session that the run stores by a short id', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(1);
  expect(ctx.readSessions()).toStrictEqual([{ session_id: '0000e001', active: 0, ended_at: '2026-10-22T12:00:00Z', ended_by: 'sweep' }]);
});

test('it keeps the sessions of a run that still has an open PR', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  addPr(ctx.db, 'GEO-9901', 'kettle#72', 'z-delivery');

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose merged PR has no final', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose last merge is inside the quiet time', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:57:00Z', mergeSha: null } });

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test.each([
  ['a running session', 'running', Date.parse('2026-10-22T11:00:00Z')],
  ['a session that needs the owner', 'needs_you', Date.parse('2026-10-22T11:00:00Z')],
  ['a done session with recent activity', 'done', Date.parse('2026-10-22T11:57:00Z')],
  ['a done session with no activity reading', 'done', null],
] as const)('it keeps the sessions of a run with %s', async (_name, state, lastMs) => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state, cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', lastMs]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it ends the session of a run merged 6 minutes ago whose session has been idle 6 minutes', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:54:00Z', mergeSha: null } });

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:54:00Z')]]);

  expect(ended).toBe(1);
  expect(ctx.readState()).toBe('merged');
});

test.each([
  ['a session active 4 minutes ago after a merge 6 minutes ago', '2026-10-22T11:54:00Z', '2026-10-22T11:56:00Z'],
  ['a merge 4 minutes ago and a session idle for 6 minutes', '2026-10-22T11:56:00Z', '2026-10-22T11:54:00Z'],
] as const)('it keeps the session of a run with %s', async (_name, mergedAt, lastActivity) => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt, mergeSha: null } });

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse(lastActivity)]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps a session with unpushed work after the 5 minutes of quiet', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:54:00Z', mergeSha: null } });

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:54:00Z')]], () => Promise.resolve({ state: 'unpushed', detail: '/workspace/kettle: 3f2a1bc add kettle lid' }));

  expect(ended).toBe(0);
  expect(fleet.calls).toStrictEqual([]);
  expect(ctx.readSessions()).toStrictEqual([{ session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null }]);
});

test('it keeps the sessions of a run whose session atc does not list', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
  expect(ctx.readSessions()).toStrictEqual([{ session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null }]);
});

test('it keeps the sessions of a run whose session has no activity reading at all', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep(fleet, []);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
  expect(ctx.readSessions()).toStrictEqual([{ session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null }]);
});

test('it keeps every session of a run while its helper session is running', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } },
      { id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: true, state: 'running', cwd: '/workspace/kettle', locator: { targetID: 'local' } },
    ],
  });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  setSession(ctx.db, 'GEO-9901', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');

  const ended = await ctx.sweep(
    fleet,
    [
      ['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
      ['0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
    ],
  );

  expect(ended).toBe(0);
  expect(ctx.readSessions()).toStrictEqual([
    { session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null },
    { session_id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null },
  ]);
});

test.each(['live-check', 'deploy-held', 'merged', 'blocked'])('it forgets and ends the quiet session of a %s run without changing the run state', async (state) => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  setState(ctx.db, 'GEO-9901', state, { waitsOn: 'a teapot supplier' }, 'z-delivery');

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(1);
  expect(ctx.readState()).toBe(state);
  expect(fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001']);
  expect(ctx.readSessions()).toStrictEqual([{ session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 0, ended_at: '2026-10-22T12:00:00Z', ended_by: 'sweep' }]);
  expect(ctx.readActions('merged-wrap-up-result')).toHaveLength(1);
});

test('it records one wrap-up for a working run that moves to merged, so the merged-run pass skips it', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);
  const wrapped = await wrapUpMergedRuns(
    ctx.db,
    { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) },
    { actor: 'z-delivery' },
  );

  expect(wrapped).toStrictEqual([]);
  expect(ctx.readState()).toBe('merged');
  expect(fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001']);
  expect(ctx.readActions('merged-wrap-up', 'merged-wrap-up-result', 'handed-in-ended')).toStrictEqual(['handed-in-ended', 'merged-wrap-up', 'merged-wrap-up-result']);
});

test('it keeps a session the wrap-up keeps for unpushed work, reports it, and the run stays working', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]], () => Promise.resolve({ state: 'unpushed', detail: '/workspace/kettle: 3f2a1bc add kettle lid' }));

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
  expect(fleet.calls).toStrictEqual([]);
  expect(ctx.readSessions()).toStrictEqual([{ session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null }]);
  expect(ctx.readActions('merged-wrap-up', 'merged-wrap-up-result', 'handed-in-ended')).toStrictEqual(['merged-wrap-up-result']);
  expect(ctx.readNews()).toStrictEqual(['GEO-9901 merged; wrap-up left kept 0000e001 (its working directory holds unpushed work (/workspace/kettle: 3f2a1bc add kettle lid), so the session stays)']);
});

test('it reports a kept session once while later sweeps keep it for the same reason', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  setState(ctx.db, 'GEO-9901', 'blocked', { waitsOn: 'a teapot supplier' }, 'z-delivery');
  await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]], () => Promise.resolve({ state: 'unpushed', detail: '/workspace/kettle: 3f2a1bc add kettle lid' }));
  overrideEnv('HQ_NOW', '2026-10-22T12:31:00Z');

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]], () => Promise.resolve({ state: 'unpushed', detail: '/workspace/kettle: 3f2a1bc add kettle lid' }));

  expect(ended).toBe(0);
  expect(ctx.readActions('merged-wrap-up-result', 'handed-in-kept')).toStrictEqual(['handed-in-kept', 'merged-wrap-up-result', 'handed-in-kept']);
  expect(ctx.readNews()).toHaveLength(1);
});

test('it retries a kept session on a later sweep once its work is pushed', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]], () => Promise.resolve({ state: 'unknown', detail: 'the check exited 1' }));
  overrideEnv('HQ_NOW', '2026-10-22T12:31:00Z');

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(1);
  expect(ctx.readState()).toBe('merged');
});

test('it waits 30 minutes before it checks a kept session again', async () => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]], () => Promise.resolve({ state: 'unknown', detail: 'the check exited 1' }));
  overrideEnv('HQ_NOW', '2026-10-22T12:29:00Z');
  const readLocalWork = mock(() => Promise.resolve({ state: 'pushed' as const }));

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]], readLocalWork);

  expect(ended).toBe(0);
  expect(readLocalWork).not.toHaveBeenCalled();
  expect(ctx.readSessions()).toStrictEqual([{ session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null }]);
});

test.each(['done', 'dropped'])('it leaves a %s run alone', async (state) => {
  const ctx = setupTest();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }] });
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  setState(ctx.db, 'GEO-9901', state, {}, 'z-delivery');

  const ended = await ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(fleet.calls).toStrictEqual([]);
  expect(ctx.readActions('handed-in-ended', 'merged-wrap-up-result')).toStrictEqual([]);
});

test('it lets only one of two passes that race on a handed-in run forget its sessions', async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  const forgetting = Promise.withResolvers<void>();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }], forgetAfter: forgetting.promise });
  const first = ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  const second = ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);
  forgetting.resolve();
  const ended = await Promise.all([first, second]);

  expect(ended).toStrictEqual([1, 0]);
  expect(fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001']);
});

test('it keeps the merged-run pass off a run whose handed-in cleanup is still running', async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  const forgetting = Promise.withResolvers<void>();
  const fleet = buildStubFleetClient({ sessions: [{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } }], forgetAfter: forgetting.promise });
  const handedIn = ctx.sweep(fleet, [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);
  await waitFor('the handed-in claim', () => ctx.readActions('handed-in-claim').length === 1);
  setState(ctx.db, 'GEO-9901', 'merged', {}, 'z-delivery');

  const merged = wrapUpMergedRuns(ctx.db, { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) }, { actor: 'z-delivery' });
  forgetting.resolve();
  const [, wrapped] = await Promise.all([handedIn, merged]);

  expect(wrapped).toStrictEqual([]);
  expect(fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001']);
});

test.each([
  ['a running sub-session', 'running', Date.parse('2026-10-22T11:00:00Z')],
  ['a done sub-session with no activity reading', 'done', null],
] as const)('it keeps the sessions of a run with %s', async (_name, state, lastMs) => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } },
      { id: '0000e003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-sketch', alive: true, state, cwd: '/workspace/kettle', locator: { targetID: 'local' }, parent: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    ],
  });
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep(
    fleet,
    [
      ['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
      ['0000e003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', lastMs],
    ],
  );

  expect(ended).toBe(0);
  expect(fleet.calls).toStrictEqual([]);
});

test('it keeps the sessions of a run whose replaced session atc still shows running', async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } },
      { id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-old-agent', alive: true, state: 'running', cwd: '/workspace/kettle', locator: { targetID: 'local' } },
    ],
  });
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-9901', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  setSession(ctx.db, 'GEO-9901', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'remove');
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep(
    fleet,
    [
      ['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
      ['0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
    ],
  );

  expect(ended).toBe(0);
  expect(fleet.calls).toStrictEqual([]);
});

test('it forgets a quiet run tree, its replaced session and sub-session included, and ends the active session', async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } },
      { id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-old-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } },
      { id: '0000e003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-sketch', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' }, parent: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    ],
  });
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-9901', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  setSession(ctx.db, 'GEO-9901', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'remove');
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep(
    fleet,
    [
      ['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
      ['0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
      ['0000e003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
    ],
  );

  expect(ended).toBe(1);
  expect(fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e003', 'unpin 0000e003', 'forget 0000e003', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001', 'unpin 0000e002', 'kill 0000e002', 'unpin 0000e002', 'forget 0000e002']);
});

test('it leaves alone a helper attached to the run after the quiet check read its sessions', async () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  const fleet = buildStubFleetClient({
    sessions: [
      { id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'done', cwd: '/workspace/kettle', locator: { targetID: 'local' } },
      { id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: true, state: 'running', cwd: '/workspace/kettle', locator: { targetID: 'local' } },
    ],
  });
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  const readActivity = mock(() => {
    setSession(ctx.db, 'GEO-9901', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
    return Promise.resolve({ lastActivityAt: Date.parse('2026-10-22T11:00:00Z'), pendingMessage: null });
  });

  const ended = await endHandedInRunSessions(
    ctx.db,
    { readActivity },
    { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) },
    { actor: 'z-delivery' },
  );

  expect(ended).toBe(1);
  expect(fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001']);
  expect(ctx.readSessions()).toStrictEqual([
    { session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 0, ended_at: '2026-10-22T12:00:00Z', ended_by: 'sweep' },
    { session_id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null },
  ]);
});
