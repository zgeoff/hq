import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { setSession } from './set-session.ts';
import { setState } from './set-state.ts';
import { updateGoneRunSessions } from './update-gone-run-sessions.ts';

const SESSION = '00000031-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// A working run, GEO-9721, with one session and its PR kettle#51 open.
function setupTest() {
  const fresh = freshDb(),
    readState = () => (fresh.db.query("SELECT state FROM runs WHERE issue = 'GEO-9721'").get() as { state: string }).state;
  onTestFinished(fresh.cleanup);
  addRun(fresh.db, { issue: 'GEO-9721', title: 'Invented kettle work', place: 'imp', session: SESSION, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(fresh.db, 'GEO-9721', 'kettle#51', 'z-delivery');
  return {
    db: fresh.db,
    readState,

    // Runs one step of the scenario and gives the run's state after it.
    step: (fn: () => unknown) => {
      fn();
      return readState();
    },
  };
}

test('the PR merges, then its session is removed: the run moves to merged at the removal', () => {
  const app = setupTest(),
    atMerge = app.step(() => closePr(app.db, 'kettle#51', { to: 'merged', actor: 'z-review' })),
    atRemove = app.step(() => setSession(app.db, 'GEO-9721', SESSION, 'z-delivery', 'remove'));
  expect([atMerge, atRemove]).toEqual(['working', 'merged']);
});

test('the session is removed, then the PR merges: the run moves to merged at the merge', () => {
  const app = setupTest(),
    atRemove = app.step(() => setSession(app.db, 'GEO-9721', SESSION, 'z-delivery', 'remove')),
    atZMerge = app.step(() => closePr(app.db, 'kettle#51', { to: 'merged', actor: 'z-review' }));
  expect([atRemove, atZMerge]).toEqual(['working', 'merged']);
});

test('the PR merges, then the sweep ends the gone session: the run moves to merged', () => {
  const LATER = new Date(Date.now() + 10 * 60_000),
    app = setupTest(),
    atMerge = app.step(() => closePr(app.db, 'kettle#51', { to: 'merged', actor: 'z-review' })),
    atSweep = app.step(() => updateGoneRunSessions(app.db, [], 'z-delivery', LATER));
  expect([atMerge, atSweep]).toEqual(['working', 'merged']);
});

test('a run stays as it is with a PR still open, with only a closed PR, or in another state', () => {
  const app = setupTest(),
    atOpen = app.step(() => {
      addPr(app.db, 'GEO-9721', 'kettle#52', 'z-delivery');
      closePr(app.db, 'kettle#51', { to: 'merged', actor: 'z-review' });
      setSession(app.db, 'GEO-9721', SESSION, 'z-delivery', 'remove');
    }),
    atPRClosed = app.step(() => closePr(app.db, 'kettle#52', { to: 'closed', actor: 'z-delivery' }));
  addRun(app.db, { issue: 'GEO-9722', title: 'Invented teapot work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(app.db, 'GEO-9722', 'teapot#8', 'z-delivery');
  closePr(app.db, 'teapot#8', { to: 'closed', actor: 'z-delivery' });
  addRun(app.db, { issue: 'GEO-9723', title: 'Invented lid work', place: 'imp', session: null, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(app.db, 'GEO-9723', 'teapot#9', 'z-delivery');
  setState(app.db, 'GEO-9723', 'blocked', { waitsOn: 'a lid supplier' }, 'z-delivery');
  closePr(app.db, 'teapot#9', { to: 'merged', actor: 'z-review' });
  expect([atOpen, atPRClosed, app.db.query("SELECT issue, state FROM runs WHERE issue IN ('GEO-9722', 'GEO-9723') ORDER BY issue").all()]).toEqual([
    'working',
    'merged',
    [
      { issue: 'GEO-9722', state: 'working' },
      { issue: 'GEO-9723', state: 'blocked' },
    ],
  ]);
});
