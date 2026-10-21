import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { addRun } from './add-run.ts';
import { setState } from './set-state.ts';
import { updateGoneRunSessions } from './update-gone-run-sessions.ts';

// A database at 01:00Z; each test adds its own runs.
function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('a run session atc no longer lists, or lists as ended, ends after one sweep of grace; a present or new one stays active, whatever its run\'s state', () => {
  const app = setupTest();
  for (const [issue, session] of [
    ['GEO-9711', '00000021-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    ['GEO-9712', '00000022-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    ['GEO-9713', '00000023-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    ['GEO-9714', '00000024-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
  ] as const) {
    addRun(app.db, { issue, title: 'Invented kettle work', place: 'local', session, next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  }
  addRun(app.db, { issue: 'GEO-9715', title: 'Invented teapot work', place: 'local', session: '00000025-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'flexible', actor: 'z-delivery' });
  for (const issue of ['GEO-9711', 'GEO-9712', 'GEO-9713', 'GEO-9714']) {
    setState(app.db, issue, 'blocked', { waitsOn: 'a teapot supplier' }, 'z-delivery');
  }
  app.db.query("UPDATE run_sessions SET added_at = '2026-10-19T00:00:00Z' WHERE session_id != '00000024-aaaa-4aaa-8aaa-aaaaaaaaaaaa'").run();
  app.db.query("UPDATE run_sessions SET added_at = '2026-10-19T00:58:00Z' WHERE session_id = '00000024-aaaa-4aaa-8aaa-aaaaaaaaaaaa'").run();

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
