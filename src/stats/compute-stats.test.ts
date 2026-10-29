import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { addPr } from '../runs/add-pr.ts';
import { addRun } from '../runs/add-run.ts';
import { closePr } from '../runs/close-pr.ts';
import { setState } from '../runs/set-state.ts';
import { computeStats } from './compute-stats.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it counts no cycle time for a closed design pass', () => {
  const ctx = setupTest();
  at('2026-10-16T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9861', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  at('2026-10-16T03:00:00Z');
  setState(ctx.db, 'GEO-9861', 'done', { note: 'design settled' }, 'z-delivery');

  const stats = computeStats(ctx.db, { from: '2026-10-16T00:00:00Z', to: '2026-10-16T04:00:00Z', gh: null });

  expect(stats.flow.cycle.n).toBe(0);
});

test('it counts no cycle time for a build run still open after its design pass closed, though the issue was Ready before the pass closed', () => {
  const ctx = setupTest();
  at('2026-10-16T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9862', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  at('2026-10-16T02:00:00Z');
  setState(ctx.db, 'GEO-9862', 'done', { note: 'design settled' }, 'z-delivery');
  at('2026-10-16T03:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9862', title: 'Build the kettle spout', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, readySince: '2026-10-16T01:30:00Z', lane: 'cloud', actor: 'z-delivery' });

  const stats = computeStats(ctx.db, { from: '2026-10-16T00:00:00Z', to: '2026-10-16T04:00:00Z', gh: null });

  expect(stats.flow.cycle.n).toBe(0);
});

test('it times a build run that followed its design pass from the build run start', () => {
  const ctx = setupTest();
  at('2026-10-16T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9863', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  at('2026-10-16T02:00:00Z');
  setState(ctx.db, 'GEO-9863', 'done', { note: 'design settled' }, 'z-delivery');
  at('2026-10-16T03:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9863', title: 'Build the kettle spout', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  at('2026-10-16T03:45:00Z');
  setState(ctx.db, 'GEO-9863', 'done', { note: 'shipped' }, 'z-delivery');

  const stats = computeStats(ctx.db, { from: '2026-10-16T00:00:00Z', to: '2026-10-16T04:00:00Z', gh: null });

  expect(stats.flow.cycle.n).toBe(1);
  expect(stats.flow.cycle.medianMin).toBe(45);
});

test('it counts no cycle time for a build run still open when its design pass closed in the same second it started', () => {
  const ctx = setupTest();
  at('2026-10-16T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9864', title: 'Design the kettle spout', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, design: 'agent', actor: 'z-delivery' });
  at('2026-10-16T02:00:00Z');
  setState(ctx.db, 'GEO-9864', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9864', title: 'Build the kettle spout', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });

  const stats = computeStats(ctx.db, { from: '2026-10-16T00:00:00Z', to: '2026-10-16T04:00:00Z', gh: null });

  expect(stats.flow.cycle.n).toBe(0);
});

test('it times no merge to done from a design pass PR merged in the second its build run started', () => {
  const ctx = setupTest();
  at('2026-10-16T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9865', title: 'Design the kettle spout', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9865', 'kettle#81', 'z-delivery');
  at('2026-10-16T02:00:00Z');
  closePr(ctx.db, 'kettle#81', { to: 'merged', actor: 'z-review' });
  setState(ctx.db, 'GEO-9865', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9865', title: 'Build the kettle spout', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  at('2026-10-16T03:00:00Z');
  setState(ctx.db, 'GEO-9865', 'done', { note: 'built with no PR' }, 'z-delivery');

  const stats = computeStats(ctx.db, { from: '2026-10-16T00:00:00Z', to: '2026-10-16T04:00:00Z', gh: null });

  expect(stats.live.mergeToDone.n).toBe(0);
});

test('it times no merge to done from a design pass PR merged after its build run started', () => {
  const ctx = setupTest();
  at('2026-10-16T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9866', title: 'Design the kettle handle', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9866', 'kettle#82', 'z-delivery');
  at('2026-10-16T02:00:00Z');
  setState(ctx.db, 'GEO-9866', 'done', { note: 'design settled' }, 'z-delivery');
  addRun(ctx.db, { issue: 'GEO-9866', title: 'Build the kettle handle', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  at('2026-10-16T02:30:00Z');
  closePr(ctx.db, 'kettle#82', { to: 'merged', actor: 'z-review' });
  at('2026-10-16T03:00:00Z');
  setState(ctx.db, 'GEO-9866', 'done', { note: 'built with no PR' }, 'z-delivery');

  const stats = computeStats(ctx.db, { from: '2026-10-16T00:00:00Z', to: '2026-10-16T04:00:00Z', gh: null });

  expect(stats.live.mergeToDone.n).toBe(0);
});
