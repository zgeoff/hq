import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../test/helpers.ts';
import { addPr } from '../runs/add-pr.ts';
import { addRun } from '../runs/add-run.ts';
import { closePr } from '../runs/close-pr.ts';
import { setState } from '../runs/set-state.ts';
import { mergedRuns } from './merged-runs.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it sizes a build run by its own merged PRs, not its design pass PR', () => {
  const ctx = setupTest();
  at('2026-10-16T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9941', title: 'Design the kettle spout', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9941', 'kettle#61', 'z-delivery');
  closePr(ctx.db, 'kettle#61', { to: 'merged', actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9941', 'done', { note: 'design settled' }, 'z-delivery');
  at('2026-10-16T02:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9941', title: 'Build the kettle spout', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', size: { size: 'S', lines: 200 }, actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9941', 'kettle#62', 'z-delivery');
  at('2026-10-16T03:00:00Z');
  closePr(ctx.db, 'kettle#62', { to: 'merged', actor: 'z-delivery' });

  expect(mergedRuns(ctx.db, '2026-10-16T00:00:00Z', '2026-10-17T00:00:00Z')).toStrictEqual([{ issue: 'GEO-9941', size: 'S', size_lines: 200, lastMerge: '2026-10-16T03:00:00Z', prs: [{ ref: 'kettle#62', url: null }] }]);
});

test('it reports a finished build run while its design pass PR stays open', () => {
  const ctx = setupTest();
  at('2026-10-16T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9942', title: 'Design the teapot lid', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9942', 'teapot#63', 'z-delivery');
  setState(ctx.db, 'GEO-9942', 'done', { note: 'design settled' }, 'z-delivery');
  at('2026-10-16T02:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9942', title: 'Build the teapot lid', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', size: { size: 'S', lines: 200 }, actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9942', 'teapot#64', 'z-delivery');
  at('2026-10-16T03:00:00Z');
  closePr(ctx.db, 'teapot#64', { to: 'merged', actor: 'z-delivery' });

  expect(mergedRuns(ctx.db, '2026-10-16T00:00:00Z', '2026-10-17T00:00:00Z')).toStrictEqual([{ issue: 'GEO-9942', size: 'S', size_lines: 200, lastMerge: '2026-10-16T03:00:00Z', prs: [{ ref: 'teapot#64', url: null }] }]);
});

test('it times a build run from its own last merge, though its design pass PR merged after it', () => {
  const ctx = setupTest();
  at('2026-10-16T01:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9943', title: 'Design the kettle base', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', design: 'agent', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9943', 'kettle#65', 'z-delivery');
  setState(ctx.db, 'GEO-9943', 'done', { note: 'design settled' }, 'z-delivery');
  at('2026-10-16T02:00:00Z');
  addRun(ctx.db, { issue: 'GEO-9943', title: 'Build the kettle base', place: 'imp', session: null, next: 'Building.', gate: null, geoffChat: false, lane: 'cloud', size: { size: 'S', lines: 200 }, actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9943', 'kettle#66', 'z-delivery');
  at('2026-10-16T03:00:00Z');
  closePr(ctx.db, 'kettle#66', { to: 'merged', actor: 'z-delivery' });
  at('2026-10-16T04:00:00Z');
  closePr(ctx.db, 'kettle#65', { to: 'merged', actor: 'z-delivery' });

  expect(mergedRuns(ctx.db, '2026-10-16T00:00:00Z', '2026-10-17T00:00:00Z')).toStrictEqual([{ issue: 'GEO-9943', size: 'S', size_lines: 200, lastMerge: '2026-10-16T03:00:00Z', prs: [{ ref: 'kettle#66', url: null }] }]);
});
