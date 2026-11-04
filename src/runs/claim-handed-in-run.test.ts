import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { overrideEnv } from '../config/override-env.ts';
import { readEvents } from '../read-events.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { claimHandedInRun } from './claim-handed-in-run.ts';
import { closePr } from './close-pr.ts';
import { setState } from './set-state.ts';
import { writeMergedClaim } from './wrap-up-merged-runs.ts';
import { writeHandedInPlan } from './write-handed-in-plan.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);

  return { db: fresh.db, readActions: () => readEvents(fresh.db, 'run', 'GEO-9921', ['handed-in-claim', 'merged-wrap-up']).map((event) => event.action) };
}

test('it claims a working run and logs the claim', () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9921', title: 'Invented kettle work', place: 'local', session: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });

  const claim = claimHandedInRun(ctx.db, 'GEO-9921', 'z-delivery', new Date('2026-10-22T12:00:00Z'));

  expect(claim).toStrictEqual({ mergedClaimed: false });
  expect(ctx.readActions()).toStrictEqual(['handed-in-claim']);
});

test('it refuses a run whose earlier claim has not finished', () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9921', title: 'Invented kettle work', place: 'local', session: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  claimHandedInRun(ctx.db, 'GEO-9921', 'z-delivery', new Date('2026-10-22T12:00:00Z'));

  const claim = claimHandedInRun(ctx.db, 'GEO-9921', 'z-delivery', new Date('2026-10-22T12:09:00Z'));

  expect(claim).toBeNull();
});

test('it claims a run again once the earlier claim logged its kept sessions', () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9921', title: 'Invented kettle work', place: 'local', session: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  claimHandedInRun(ctx.db, 'GEO-9921', 'z-delivery', new Date('2026-10-22T12:00:00Z'));
  writeHandedInPlan(
    ctx.db,
    { end: [], kept: { kept: [{ id: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }], failed: [] }, report: false, tryMergedUpdate: false },
    { issue: 'GEO-9921', wrapUp: { forgotten: [], destroyed: [], kept: [{ id: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', reason: 'pinned in atc' }], failed: [] }, actor: 'z-delivery', at: new Date('2026-10-22T12:00:00Z') },
  );

  const claim = claimHandedInRun(ctx.db, 'GEO-9921', 'z-delivery', new Date('2026-10-22T12:01:00Z'));

  expect(claim).toStrictEqual({ mergedClaimed: false });
});

test('it claims a run again once an unfinished claim is over 10 minutes old', () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9921', title: 'Invented kettle work', place: 'local', session: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  claimHandedInRun(ctx.db, 'GEO-9921', 'z-delivery', new Date('2026-10-22T12:00:00Z'));

  const claim = claimHandedInRun(ctx.db, 'GEO-9921', 'z-delivery', new Date('2026-10-22T12:11:00Z'));

  expect(claim).toStrictEqual({ mergedClaimed: false });
});

test('it claims the merged wrap-up of a merged run that the merged-run pass has not wrapped up', () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9921', title: 'Invented kettle work', place: 'local', session: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9921', 'kettle#81', 'z-delivery');
  closePr(ctx.db, 'kettle#81', { to: 'merged', actor: 'hq-github' });
  setState(ctx.db, 'GEO-9921', 'merged', {}, 'z-delivery');

  const claim = claimHandedInRun(ctx.db, 'GEO-9921', 'z-delivery', new Date('2026-10-22T12:00:00Z'));

  expect(claim).toStrictEqual({ mergedClaimed: true });
  expect(ctx.readActions()).toStrictEqual(['merged-wrap-up', 'handed-in-claim']);
});

test('it refuses a run whose merged wrap-up another pass has claimed and not finished', () => {
  const ctx = setupTest();
  onTestFinished(overrideEnv('HQ_NOW', '2026-10-22T12:00:00Z'));
  addRun(ctx.db, { issue: 'GEO-9921', title: 'Invented kettle work', place: 'local', session: '0000c001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9921', 'kettle#81', 'z-delivery');
  closePr(ctx.db, 'kettle#81', { to: 'merged', actor: 'hq-github' });
  setState(ctx.db, 'GEO-9921', 'merged', {}, 'z-delivery');
  writeMergedClaim(ctx.db, 'GEO-9921', 'z-delivery');

  const claim = claimHandedInRun(ctx.db, 'GEO-9921', 'z-delivery', new Date('2026-10-22T12:05:00Z'));

  expect(claim).toBeNull();
});
