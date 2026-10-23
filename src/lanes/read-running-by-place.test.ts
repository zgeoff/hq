import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { recordAwake } from '../areas/record-awake.ts';
import { setMeta } from '../db/set-meta.ts';
import { addRun } from '../runs/add-run.ts';
import { setSession } from '../runs/set-session.ts';
import { setState } from '../runs/set-state.ts';
import { readRunningByPlace } from './read-running-by-place.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at('2026-10-15T20:00:00Z');
  return { db: fresh.db };
}

test('it counts a run filed imp whose awake session runs here as local, not imp', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Descale the kettle', place: 'imp', session: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'local' } }]);

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 0, local: 1, issues: ['GEO-9901'], localSource: null });
});

test('it counts a run filed imp whose session runs here among the local runs when those runs outnumber the live sessions', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9911', title: 'Descale the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9912', title: 'Polish the teapot', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9913', title: 'Fill the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9914', title: 'Warm the teapot', place: 'imp', session: 'a0000014-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000014-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true, state: 'running', locator: { targetID: 'local' } }]);

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 0, local: 4, issues: ['GEO-9911', 'GEO-9912', 'GEO-9913', 'GEO-9914'], localSource: null });
});

test('it counts the awake local session of a merged run', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9902', title: 'Polish the teapot', place: 'local', session: 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  addRun(ctx.db, { issue: 'GEO-9903', title: 'Fill the kettle', place: 'local', session: 'a0000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9903', 'merged', {}, 'z-delivery');
  recordAwake(ctx.db, [
    { id: 'a0000002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true, state: 'running', locator: { targetID: 'local' } },
    { id: 'a0000003-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'local' } },
  ]);

  const running = readRunningByPlace(ctx.db);

  expect([running.local, running.localSource]).toStrictEqual([2, '2 live sessions here']);
});

test('it counts a helper session of a flexible-lane run beside its main session', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9904', title: 'Descale the kettle', place: 'local', session: 'a0000004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-9904', 'a0000005-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');
  recordAwake(ctx.db, [
    { id: 'a0000004-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'local' } },
    { id: 'a0000005-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-helper', alive: true, state: 'running', locator: { targetID: 'local' } },
  ]);

  const running = readRunningByPlace(ctx.db);

  expect([running.local, running.localSource]).toStrictEqual([2, '2 live sessions here']);
});

test("it leaves out a fleet session hq fleet knows, though a run lists it", () => {
  const ctx = setupTest();
  setMeta(ctx.db, 'fleet_ids', JSON.stringify({ 'z-kettle': 'a0000006-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));
  addRun(ctx.db, { issue: 'GEO-9905', title: 'Descale the kettle', place: 'imp', session: 'a0000006-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000006-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'z-kettle', alive: true, state: 'running', locator: { targetID: 'local' } }]);

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 1, local: 0, issues: ['GEO-9905'], localSource: null });
});

test('it leaves out an awake session atc places on another host', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9906', title: 'Descale the kettle', place: 'imp', session: 'a0000007-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000007-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'imp-kettle' } }]);

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 1, local: 0, issues: ['GEO-9906'], localSource: null });
});

test('it falls back to the runs filed local when the reading is over 15 min old', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9907', title: 'Descale the kettle', place: 'imp', session: 'a0000008-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000008-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: true, state: 'running', locator: { targetID: 'local' } }]);

  expect(readRunningByPlace(ctx.db, new Date('2026-10-15T20:16:00Z'))).toStrictEqual({ imp: 1, local: 0, issues: ['GEO-9907'], localSource: null });
});

test('it falls back to the runs filed local on a reading from before the sweep recorded local sessions', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9908', title: 'Descale the kettle', place: 'imp', session: 'a0000009-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setMeta(ctx.db, 'atc_awake', JSON.stringify({ at: '2026-10-15T20:00:00Z', ids: ['a0000009-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], idle: {}, present: ['a0000009-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }));

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 1, local: 0, issues: ['GEO-9908'], localSource: null });
});
