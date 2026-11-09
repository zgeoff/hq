import { expect, onTestFinished, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing/helpers';
import { freshDb } from '../../test/helpers.ts';
import { addRun } from './add-run.ts';
import { readRunSessionRows } from './read-run-session-rows.ts';
import { setSession } from './set-session.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);

  return { db: fresh.db };
}

test('it reads every recorded session with its run, oldest first', () => {
  const ctx = setupTest();
  updateEnv('HQ_NOW', '2026-11-07T03:00:00Z');
  addRun(ctx.db, { issue: 'GEO-611', title: 'Invented kettle work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-611', '0000f001', 'z-delivery', 'add');
  setState(ctx.db, 'GEO-611', 'dropped', { note: 'invented' }, 'z-delivery');
  updateEnv('HQ_NOW', '2026-11-07T03:01:00Z');
  addRun(ctx.db, { issue: 'GEO-612', title: 'Invented teapot work', place: 'local', session: null, next: 'Working.', gate: null, geoffChat: true, lane: 'cloud', actor: 'z-delivery' });
  setSession(ctx.db, 'GEO-612', '0000f002', 'z-delivery', 'add');

  expect(readRunSessionRows(ctx.db)).toStrictEqual([
    { sessionID: '0000f001', issue: 'GEO-611', active: false, endedBy: null, open: false, ownerChats: false },
    { sessionID: '0000f002', issue: 'GEO-612', active: true, endedBy: null, open: true, ownerChats: true },
  ]);
});
