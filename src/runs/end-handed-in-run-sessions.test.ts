import { expect, onTestFinished, test } from 'bun:test';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import { freshDb } from '../../test/helpers.ts';
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

  const fleet = buildStubFleetClient({
    sessions: ['0000e001', '0000e002'].map((prefix) => ({ id: `${prefix}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, name: `kettle-${prefix}`, alive: true, cwd: '/workspace/kettle', locator: { targetID: 'local' } })),
  });

  return {
    db: fresh.db,
    readEvents: (...actions: string[]) =>
      fresh.db
        .query(`SELECT action FROM events WHERE subject_id = 'GEO-9901' AND action IN (${actions.map(() => '?').join(', ')}) ORDER BY seq`)
        .all(...actions),

    fleet,
    sweep: (sessions: { id: string; state: string }[], activity: [string, number | null][], readLocalWork: WrapUpDeps['readLocalWork'] = () => Promise.resolve({ state: 'pushed' })) =>
      endHandedInRunSessions(
        fresh.db,
        { sessions: sessions.map((session) => ({ ...session, alive: true })), activity: new Map(activity) },
        { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork },
        { actor: 'z-delivery', at: new Date('2026-10-22T12:00:00Z') },
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
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  setSession(ctx.db, 'GEO-9901', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');

  const ended = await ctx.sweep(
    [
      { id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' },
      { id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' },
    ],
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
  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001', 'unpin 0000e002', 'kill 0000e002', 'unpin 0000e002', 'forget 0000e002']);
  expect(ctx.db.query("SELECT subject_id, data FROM events WHERE action = 'handed-in-ended'").all()).toStrictEqual([{ subject_id: 'GEO-9901', data: JSON.stringify({ sessions: ['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }) }]);
});

test('it ends a handed-in session that the run stores by a short id', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], [['0000e001', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(1);
  expect(ctx.readSessions()).toStrictEqual([{ session_id: '0000e001', active: 0, ended_at: '2026-10-22T12:00:00Z', ended_by: 'sweep' }]);
});

test('it keeps the sessions of a run that still has an open PR', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  addPr(ctx.db, 'GEO-9901', 'kettle#72', 'z-delivery');

  const ended = await ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose merged PR has no final', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose last merge is inside the quiet time', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:45:00Z', mergeSha: null } });

  const ended = await ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test.each([
  ['a running session', 'running', Date.parse('2026-10-22T11:00:00Z')],
  ['a session that needs the owner', 'needs_you', Date.parse('2026-10-22T11:00:00Z')],
  ['a done session with recent activity', 'done', Date.parse('2026-10-22T11:45:00Z')],
  ['a done session with no activity reading', 'done', null],
] as const)('it keeps the sessions of a run with %s', async (_name, state, lastMs) => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', lastMs]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose session atc does not list', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep([], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
  expect(ctx.readSessions()).toStrictEqual([{ session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null }]);
});

test('it keeps the sessions of a run whose session has no activity reading at all', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], []);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
  expect(ctx.readSessions()).toStrictEqual([{ session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null }]);
});

test('it keeps every session of a run while its helper session is running', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  setSession(ctx.db, 'GEO-9901', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');

  const ended = await ctx.sweep(
    [
      { id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' },
      { id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'running' },
    ],
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
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  setState(ctx.db, 'GEO-9901', state, { waitsOn: 'a teapot supplier' }, 'z-delivery');

  const ended = await ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(1);
  expect(ctx.readState()).toBe(state);
  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001']);
  expect(ctx.readSessions()).toStrictEqual([{ session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 0, ended_at: '2026-10-22T12:00:00Z', ended_by: 'sweep' }]);
  expect(ctx.readEvents('merged-wrap-up-result')).toHaveLength(1);
});

test('it records one wrap-up for a working run that moves to merged, so the merged-run pass skips it', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  await ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);
  const wrapped = await wrapUpMergedRuns(
    ctx.db,
    { openClient: () => Promise.resolve(ctx.fleet.client), readImpWork: () => Promise.reject(new Error('a local run checks no imp')), readLocalWork: () => Promise.resolve({ state: 'pushed' as const }) },
    { actor: 'z-delivery' },
  );

  expect(wrapped).toStrictEqual([]);
  expect(ctx.readState()).toBe('merged');
  expect(ctx.fleet.calls).toStrictEqual(['unpin 0000e001', 'kill 0000e001', 'unpin 0000e001', 'forget 0000e001']);
  expect(ctx.readEvents('merged-wrap-up', 'merged-wrap-up-result', 'handed-in-ended')).toStrictEqual([{ action: 'handed-in-ended' }, { action: 'merged-wrap-up' }, { action: 'merged-wrap-up-result' }]);
});

test('it keeps a session the wrap-up keeps for unpushed work, and the run stays working', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = await ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]], () => Promise.resolve({ state: 'unpushed', detail: '/workspace/kettle: 3f2a1bc add kettle lid' }));

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
  expect(ctx.fleet.calls).toStrictEqual([]);
  expect(ctx.readSessions()).toStrictEqual([{ session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null }]);
  expect(ctx.readEvents('merged-wrap-up', 'merged-wrap-up-result', 'handed-in-ended')).toStrictEqual([]);
});

test('it retries a kept session on a later sweep once its work is pushed', async () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  await ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]], () => Promise.resolve({ state: 'unknown', detail: 'the check exited 1' }));
  const ended = await ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(1);
  expect(ctx.readState()).toBe('merged');
});

test.each(['done', 'dropped'])('it leaves a %s run alone', async (state) => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  setState(ctx.db, 'GEO-9901', state, {}, 'z-delivery');

  const ended = await ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(ctx.fleet.calls).toStrictEqual([]);
  expect(ctx.readEvents('handed-in-ended', 'merged-wrap-up-result')).toStrictEqual([]);
});
