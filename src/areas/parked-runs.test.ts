import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { addRun } from '../runs/add-run.ts';
import { setState } from '../runs/set-state.ts';
import { parkedRuns } from './parked-runs.ts';
import { recordAwake } from './record-awake.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it keeps a new build run with no session of its own unparked, though its design pass session is gone', () => {
  const ctx = setupTest();
  at('2026-10-15T20:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9933', title: 'Design the kettle base', place: 'imp', session: 'a0000035-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9933', 'done', { note: 'design settled' }, 'z-delivery');
  at('2026-10-15T20:10:00Z');
  addRun(ctx.db, { issue: 'GEO-9933', title: 'Build the kettle base', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  recordAwake(ctx.db, [{ id: 'a0000036-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'teapot-agent', alive: true, state: 'running', locator: { targetID: 'imp-teapot' } }]);

  expect(parkedRuns(ctx.db, new Date('2026-10-15T20:10:00Z'))).toStrictEqual([]);
});
