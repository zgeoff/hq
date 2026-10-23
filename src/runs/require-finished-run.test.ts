import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { requireFinishedRun } from './require-finished-run.ts';
import { setSession } from './set-session.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  addRun(fresh.db, { issue: 'GEO-9871', title: 'Stack the kettle layers', place: 'imp', session: '5eed5eed-0000-4000-8000-000000000001', next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });
  addPr(fresh.db, 'GEO-9871', 'kettle#11', 'z-delivery');
  addPr(fresh.db, 'GEO-9871', 'kettle#12', 'z-delivery');
  closePr(fresh.db, 'kettle#11', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-20T03:04:05Z', mergeSha: null } });
  return { db: fresh.db };
}

test('it refuses to move a stacked run past its merge while a layer is open and its agent works', () => {
  const ctx = setupTest();

  expect(() => requireFinishedRun(ctx.db, 'GEO-9871', 'deploy-held', false)).toThrow(
    expect.objectContaining({ code: 'bad_state', message: 'GEO-9871 still has open PR kettle#12 and active session 5eed5eed, so its work is not finished: it moves to merged when its last PR merges and its session ends. Pass --force to move it to deploy-held now.' }),
  );
});

test('it refuses while only the agent session is left, as when a layer is not pushed yet', () => {
  const ctx = setupTest();
  closePr(ctx.db, 'kettle#12', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-20T04:04:05Z', mergeSha: null } });

  expect(() => requireFinishedRun(ctx.db, 'GEO-9871', 'merged', false)).toThrow(expect.objectContaining({ code: 'bad_state', message: expect.stringContaining('still has active session 5eed5eed,') }));
});

test('it lets the run move once every PR merged and its session ended', () => {
  const ctx = setupTest();
  closePr(ctx.db, 'kettle#12', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-20T04:04:05Z', mergeSha: null } });
  setSession(ctx.db, 'GEO-9871', '5eed5eed-0000-4000-8000-000000000001', 'z-delivery', 'remove');

  expect(() => requireFinishedRun(ctx.db, 'GEO-9871', 'deploy-held', false)).not.toThrow();
});

test('it lets --force move an unfinished run', () => {
  const ctx = setupTest();

  expect(() => requireFinishedRun(ctx.db, 'GEO-9871', 'deploy-held', true)).not.toThrow();
});

test('it leaves moves that do not pass the merge alone', () => {
  const ctx = setupTest();

  expect(() => requireFinishedRun(ctx.db, 'GEO-9871', 'blocked', false)).not.toThrow();
});

test('it leaves a run already past its merge alone', () => {
  const ctx = setupTest();
  setState(ctx.db, 'GEO-9871', 'merged', {}, 'z-delivery');

  expect(() => requireFinishedRun(ctx.db, 'GEO-9871', 'deploy-held', false)).not.toThrow();
});
