import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { readRunningByPlace } from '../lanes/read-running-by-place.ts';
import { addRun } from './add-run.ts';
import { setPlace } from './set-place.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it moves an open run to another place and logs the move with its note', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9891', title: 'Descale the kettle', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });

  const placed = setPlace(ctx.db, { issue: 'GEO-9891', place: 'local', note: 'its session runs on this host', actor: 'z-delivery' });

  expect(placed).toMatchObject({ ok: true, run: { place: 'local' } });
  expect(ctx.db.query("SELECT actor, from_state, to_state, data FROM events WHERE subject_id = 'GEO-9891' AND action = 'place'").all()).toStrictEqual([
    { actor: 'z-delivery', from_state: 'imp', to_state: 'local', data: JSON.stringify({ note: 'its session runs on this host' }) },
  ]);
});

test('it counts a moved run in its new place for the lanes', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9891', title: 'Descale the kettle', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });

  setPlace(ctx.db, { issue: 'GEO-9891', place: 'local', note: null, actor: 'z-delivery' });

  expect(readRunningByPlace(ctx.db)).toStrictEqual({ imp: 0, local: 1, issues: ['GEO-9891'], impIssues: [], localSource: null });
});

test('it refuses an issue with no run as not_found', () => {
  const ctx = setupTest();

  expect(() => setPlace(ctx.db, { issue: 'GEO-9899', place: 'local', note: null, actor: 'z-delivery' })).toThrow(expect.objectContaining({ code: 'not_found', message: 'no run for GEO-9899' }));
});

test('it refuses a closed run as bad_state and leaves its place', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9892', title: 'Polish the teapot', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });
  setState(ctx.db, 'GEO-9892', 'dropped', { note: 'teapot recalled' }, 'z-delivery');

  expect(() => setPlace(ctx.db, { issue: 'GEO-9892', place: 'local', note: null, actor: 'z-delivery' })).toThrow(expect.objectContaining({ code: 'bad_state', message: 'GEO-9892 is dropped' }));
  expect(ctx.db.query("SELECT place FROM runs WHERE issue = 'GEO-9892'").get()).toStrictEqual({ place: 'imp' });
});

test('it refuses a place that is not imp, local or none as bad_args', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9891', title: 'Descale the kettle', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });

  expect(setPlace(ctx.db, { issue: 'GEO-9891', place: 'cloud', note: null, actor: 'z-delivery' })).toStrictEqual({ ok: false, refusal: 'place must be imp, local or none, not "cloud"' });
});

test('it refuses the place the run already has, and logs nothing', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9893', title: 'Fill the kettle', place: 'local', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: null, actor: 'z-delivery' });

  expect(setPlace(ctx.db, { issue: 'GEO-9893', place: 'local', note: null, actor: 'z-delivery' })).toStrictEqual({ ok: false, refusal: 'GEO-9893 is already local' });
  expect(ctx.db.query("SELECT count(*) AS total FROM events WHERE action = 'place'").get()).toStrictEqual({ total: 0 });
});
