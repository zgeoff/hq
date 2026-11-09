import { expect, onTestFinished, test } from 'bun:test';
import { buildStubFleetClient } from '../../test/build-stub-fleet-client.ts';
import type { StubFleetAnswers } from '../../test/build-stub-fleet-client.ts';
import type { FleetSession } from '../fleet/types.ts';
import { at, freshDb } from '../../test/helpers.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';
import { addRun } from './add-run.ts';
import { getRun } from './get-run.ts';
import { readRunSessionRows } from './read-run-session-rows.ts';
import { removeOrphanSessions } from './remove-orphan-sessions.ts';
import { runHandedInHoldCheck } from './run-handed-in-hold-check.ts';
import { setState } from './set-state.ts';
import type { ImpWork } from './types.ts';
import { updateGoneRunSessions } from './update-gone-run-sessions.ts';
import { wrapUpMergedRuns } from './wrap-up-merged-runs.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  const seed = buildSeeder(fresh);
  const sessions: FleetSession[] = [];
  const work: { current: ImpWork } = { current: { state: 'pushed' } };
  const forgets: NonNullable<StubFleetAnswers['forgets']> = {};
  const fleet = buildStubFleetClient({ sessions, forgets });
  const deps = { openClient: () => Promise.resolve(fleet.client), readImpWork: () => Promise.resolve(work.current), readLocalWork: () => Promise.resolve(work.current) };

  return {
    db: fresh.db,
    seed,
    sessions,
    work,
    forgets,
    fleet,
    deps,
    checkScope: (issue: string, description: string) => runHandedInHoldCheck(fresh.db, { readIssueDescription: () => Promise.resolve(description), log: () => {} }, issue, 'z-delivery'),
    readSession: () => readRunSessionRows(fresh.db).filter((row) => row.sessionID === '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa').map((row) => ({ active: row.active, endedBy: row.endedBy })) };
}

test('a run session atc no longer lists, or lists as ended, ends after one sweep of grace; a present or new one stays active, whatever its run\'s state', () => {
  const app = setupTest();
  at('2026-10-19T00:00:00Z');
  for (const [issue, session] of [
    ['GEO-9711', '00000021-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    ['GEO-9712', '00000022-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    ['GEO-9713', '00000023-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
  ] as const) {
    addRun(app.db, { issue, title: 'Invented kettle work', place: 'local', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  }
  addRun(app.db, { issue: 'GEO-9715', title: 'Invented teapot work', place: 'local', session: '00000025-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  at('2026-10-19T00:58:00Z');
  addRun(app.db, { issue: 'GEO-9714', title: 'Invented kettle work', place: 'local', session: '00000024-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  for (const issue of ['GEO-9711', 'GEO-9712', 'GEO-9713', 'GEO-9714']) {
    setState(app.db, issue, 'blocked', { waitsOn: 'a teapot supplier' }, 'z-delivery');
  }

  expect(
    updateGoneRunSessions(
      app.db,
      [
        { id: '00000021-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true },
        { id: '00000022-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: false, lifecycle: { vm: 'asleep' } },
        { id: '00000023-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: false, lifecycle: { harness: 'exited', desired: 'stop' } },
      ],
      'z-delivery',
      new Date('2026-10-19T01:00:00Z'),
    ),
  ).toBe(2);
  expect(app.db.query('SELECT session_id, active, ended_at, ended_by FROM run_sessions ORDER BY session_id').all()).toStrictEqual([
    { session_id: '00000021-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null },
    { session_id: '00000022-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null },
    { session_id: '00000023-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 0, ended_at: '2026-10-19T01:00:00Z', ended_by: 'sweep' },
    { session_id: '00000024-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null },
    { session_id: '00000025-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 0, ended_at: '2026-10-19T01:00:00Z', ended_by: 'sweep' },
  ]);
});

test('it ends the asleep session of a working run with every PR merged, moves the run to merged and forgets the session after the work check', async () => {
  const ctx = setupTest();
  at('2026-10-19T00:00:00Z');
  ctx.seed.run({ issue: 'GEO-9731', place: 'local', session: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  ctx.seed.mergedRunPR({ issue: 'GEO-9731', ref: 'kettle#31' });
  const asleep = { id: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'idle', lifecycle: { vm: 'asleep' } };
  ctx.sessions.push(asleep);

  expect(updateGoneRunSessions(ctx.db, [asleep], 'z-delivery', new Date('2026-10-19T01:00:00Z'))).toBe(1);
  expect(ctx.readSession()).toStrictEqual([{ active: false, endedBy: 'sweep' }]);
  expect(getRun(ctx.db, 'GEO-9731')?.state).toBe('merged');
  const wrapped = await wrapUpMergedRuns(ctx.db, ctx.deps, { actor: 'sweep' });
  expect(wrapped).toStrictEqual([{ issue: 'GEO-9731', wrapUp: { forgotten: ['00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], destroyed: [], kept: [], failed: [] } }]);
});

test('it ends the asleep session of a working run on an imp with every PR merged and destroys the imp after the work check', async () => {
  const ctx = setupTest();
  at('2026-10-19T00:00:00Z');
  ctx.seed.run({ issue: 'GEO-9731', place: 'imp', session: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  ctx.seed.mergedRunPR({ issue: 'GEO-9731', ref: 'kettle#31' });
  const asleep = { id: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'idle', lifecycle: { vm: 'asleep' } };
  ctx.sessions.push(asleep);
  ctx.forgets['00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] = [{ forgotten: false, confirmToken: 'token-kettle' }];
  updateGoneRunSessions(ctx.db, [asleep], 'z-delivery', new Date('2026-10-19T01:00:00Z'));

  const wrapped = await wrapUpMergedRuns(ctx.db, ctx.deps, { actor: 'sweep' });

  expect(wrapped).toStrictEqual([{ issue: 'GEO-9731', wrapUp: { forgotten: ['00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], destroyed: ['00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], kept: [], failed: [] } }]);
  expect(ctx.fleet.calls).toStrictEqual(['unpin 00000031', 'forget-live 00000031', 'forget-live 00000031 token-kettle']);
});

test('it keeps the asleep session of a working run with every PR merged when its imp holds unpushed work', async () => {
  const ctx = setupTest();
  at('2026-10-19T00:00:00Z');
  ctx.seed.run({ issue: 'GEO-9731', place: 'imp', session: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  ctx.seed.mergedRunPR({ issue: 'GEO-9731', ref: 'kettle#31' });
  const asleep = { id: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'idle', lifecycle: { vm: 'asleep' } };
  ctx.sessions.push(asleep);
  ctx.work.current = { state: 'unpushed', detail: 'one commit' };
  updateGoneRunSessions(ctx.db, [asleep], 'z-delivery', new Date('2026-10-19T01:00:00Z'));

  const wrapped = await wrapUpMergedRuns(ctx.db, ctx.deps, { actor: 'sweep' });

  expect(wrapped).toStrictEqual([
    { issue: 'GEO-9731', wrapUp: { forgotten: [], destroyed: [], kept: [{ id: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: expect.stringContaining('unpushed work (one commit)') }], failed: [] } },
  ]);
  expect(ctx.fleet.calls).toStrictEqual([]);
});

test('it keeps the asleep session of a working run held for open Scope boxes active, and the run stays working', async () => {
  const ctx = setupTest();
  at('2026-10-19T00:00:00Z');
  ctx.seed.run({ issue: 'GEO-9731', place: 'local', session: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  setState(ctx.db, 'GEO-9731', 'working', { waitsOn: 'free slots for the spout#3 part' }, 'z-delivery');
  await ctx.checkScope('GEO-9731', '## Scope\n\n- [x] kettle: done\n- [ ] spout: next part\n');
  ctx.seed.mergedRunPR({ issue: 'GEO-9731', ref: 'kettle#31' });
  const asleep = { id: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'idle', lifecycle: { vm: 'asleep' } };

  expect(updateGoneRunSessions(ctx.db, [asleep], 'z-delivery', new Date('2026-10-19T01:00:00Z'))).toBe(0);
  expect(ctx.readSession()).toStrictEqual([{ active: true, endedBy: null }]);
  expect(getRun(ctx.db, 'GEO-9731')?.state).toBe('working');
});

test('it ends the asleep session of a blocked run with every PR merged and forgets it after the work check, and the run stays blocked', async () => {
  const ctx = setupTest();
  at('2026-10-19T00:00:00Z');
  ctx.seed.blockedRun({ issue: 'GEO-9731', place: 'local', session: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  ctx.seed.mergedRunPR({ issue: 'GEO-9731', ref: 'kettle#31' });
  const asleep = { id: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'idle', lifecycle: { vm: 'asleep' } };
  ctx.sessions.push(asleep);

  expect(updateGoneRunSessions(ctx.db, [asleep], 'z-delivery', new Date('2026-10-19T01:00:00Z'))).toBe(1);
  await removeOrphanSessions(ctx.db, ctx.deps, [asleep], { actor: 'sweep', log: () => {}, nowMs: Date.parse('2026-10-19T01:00:00Z') });

  expect(ctx.fleet.calls).toStrictEqual(['unpin 00000031', 'forget-live 00000031']);
  expect(getRun(ctx.db, 'GEO-9731')?.state).toBe('blocked');
});

test('it keeps the asleep session of a fully merged run that holds unpushed work', async () => {
  const ctx = setupTest();
  at('2026-10-19T00:00:00Z');
  ctx.seed.blockedRun({ issue: 'GEO-9731', place: 'local', session: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  ctx.seed.mergedRunPR({ issue: 'GEO-9731', ref: 'kettle#31' });
  const asleep = { id: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'idle', lifecycle: { vm: 'asleep' } };
  ctx.sessions.push(asleep);
  ctx.work.current = { state: 'unpushed', detail: 'one commit' };

  expect(updateGoneRunSessions(ctx.db, [asleep], 'z-delivery', new Date('2026-10-19T01:00:00Z'))).toBe(1);
  await removeOrphanSessions(ctx.db, ctx.deps, [asleep], { actor: 'sweep', log: () => {}, nowMs: Date.parse('2026-10-19T01:00:00Z') });

  expect(ctx.fleet.calls).toStrictEqual([]);
});

test('it keeps the alive session of a fully merged run active', () => {
  const ctx = setupTest();
  at('2026-10-19T00:00:00Z');
  ctx.seed.run({ issue: 'GEO-9731', place: 'local', session: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  ctx.seed.mergedRunPR({ issue: 'GEO-9731', ref: 'kettle#31' });

  expect(updateGoneRunSessions(ctx.db, [{ id: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa', alive: true }], 'z-delivery', new Date('2026-10-19T01:00:00Z'))).toBe(0);
  expect(ctx.readSession()).toStrictEqual([{ active: true, endedBy: null }]);
  expect(getRun(ctx.db, 'GEO-9731')?.state).toBe('working');
});

test('it keeps the asleep session of a run with an open PR active', () => {
  const ctx = setupTest();
  at('2026-10-19T00:00:00Z');
  ctx.seed.run({ issue: 'GEO-9731', place: 'local', session: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
  ctx.seed.mergedRunPR({ issue: 'GEO-9731', ref: 'kettle#31' });
  ctx.seed.runPR({ issue: 'GEO-9731', ref: 'kettle#32' });
  const asleep = { id: '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false, state: 'idle', lifecycle: { vm: 'asleep' } };

  expect(updateGoneRunSessions(ctx.db, [asleep], 'z-delivery', new Date('2026-10-19T01:00:00Z'))).toBe(0);
  expect(ctx.readSession()).toStrictEqual([{ active: true, endedBy: null }]);
});

