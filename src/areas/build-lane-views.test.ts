import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../test/helpers.ts';
import { buildLaneViews } from './build-lane-views.ts';
import { parseReady } from './parse-ready.ts';
import { readReadyByLane } from './read-ready-by-lane.ts';
import { reportLaneReady } from './report-lane-ready.ts';

function setupTest() {
  const fresh = freshDb();

  onTestFinished(fresh.cleanup);
  at(NOON_SYDNEY);

  return { db: fresh.db };
}

test('it lends an idle imp lane to a lane short of slots when both lend', () => {
  const ctx = setupTest();
  const lanes = [
    { name: 'kettle', place: 'imp' as const, size: 2, lends: true },
    { name: 'teapot', place: 'local' as const, size: 1, lends: true },
  ];
  reportLaneReady(ctx.db, parseReady(lanes, 'kettle=0,teapot=3'), 'z-delivery');

  const views = buildLaneViews(lanes, { teapot: 1 }, readReadyByLane(ctx.db, 30), { slots: 5, heldBy: 'imp budget or provider quota', line: null });

  expect(views.map((view) => [view.name, view.lendTo])).toStrictEqual([
    ['kettle', 'teapot'],
    ['teapot', null],
  ]);
});

test.each([
  ['the idle lane is marked lends: false', false, true],
  ['the short lane is marked lends: false', true, false],
  ['both lanes are marked lends: false', false, false],
])('it lends nothing when %s', (_label, lenderLends, borrowerLends) => {
  const ctx = setupTest();
  const lanes = [
    { name: 'kettle', place: 'imp' as const, size: 2, lends: lenderLends },
    { name: 'teapot', place: 'local' as const, size: 1, lends: borrowerLends },
  ];
  reportLaneReady(ctx.db, parseReady(lanes, 'kettle=0,teapot=3'), 'z-delivery');

  const views = buildLaneViews(lanes, { teapot: 1 }, readReadyByLane(ctx.db, 30), { slots: 5, heldBy: 'imp budget or provider quota', line: null });

  expect(views.map((view) => [view.name, view.lendTo])).toStrictEqual([
    ['kettle', null],
    ['teapot', null],
  ]);
});
