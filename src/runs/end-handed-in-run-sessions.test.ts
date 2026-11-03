import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { endHandedInRunSessions } from './end-handed-in-run-sessions.ts';
import { finalPr } from './final-pr.ts';
import { getRun } from './get-run.ts';
import { setSession } from './set-session.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);

  return {
    db: fresh.db,
    sweep: (sessions: { id: string; state: string }[], activity: [string, number | null][]) =>
      endHandedInRunSessions(fresh.db, { sessions: sessions.map((session) => ({ ...session, alive: true })), activity: new Map(activity) }, 'z-delivery', new Date('2026-10-22T12:00:00Z')),
    readState: () => getRun(fresh.db, 'GEO-9901')?.state,
    readSessions: () => fresh.db.query('SELECT session_id, active, ended_at, ended_by FROM run_sessions ORDER BY session_id').all(),
  };
}

test('it ends the sessions of a handed-in run, helpers included, and moves the run to merged', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  setSession(ctx.db, 'GEO-9901', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');

  const ended = ctx.sweep(
    [
      { id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' },
      { id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' },
    ],
    [
      ['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
      ['0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
    ],
  );

  expect(ended).toBe(2);
  expect(ctx.readSessions()).toStrictEqual([
    { session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 0, ended_at: '2026-10-22T12:00:00Z', ended_by: 'sweep' },
    { session_id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 0, ended_at: '2026-10-22T12:00:00Z', ended_by: 'sweep' },
  ]);
  expect(ctx.readState()).toBe('merged');
  expect(ctx.db.query("SELECT subject_id, data FROM events WHERE action = 'handed-in-ended'").all()).toStrictEqual([{ subject_id: 'GEO-9901', data: JSON.stringify({ sessions: ['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }) }]);
});

test('it keeps the sessions of a run that still has an open PR', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  addPr(ctx.db, 'GEO-9901', 'kettle#72', 'z-delivery');

  const ended = ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose merged PR has no final', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose last merge is inside the quiet time', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:45:00Z', mergeSha: null } });

  const ended = ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test.each([
  ['a running session', 'running', Date.parse('2026-10-22T11:00:00Z')],
  ['a session that needs the owner', 'needs_you', Date.parse('2026-10-22T11:00:00Z')],
  ['a done session with recent activity', 'done', Date.parse('2026-10-22T11:45:00Z')],
  ['a done session with no activity reading', 'done', null],
] as const)('it keeps the sessions of a run with %s', (_name, state, lastMs) => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', lastMs]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose session atc does not list', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = ctx.sweep([], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
  expect(ctx.readSessions()).toStrictEqual([{ session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null }]);
});

test('it keeps the sessions of a run whose session has no activity reading at all', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });

  const ended = ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], []);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
  expect(ctx.readSessions()).toStrictEqual([{ session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null }]);
});

test('it keeps every session of a run while its helper session is running', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  setSession(ctx.db, 'GEO-9901', '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'z-delivery', 'add');

  const ended = ctx.sweep(
    [
      { id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' },
      { id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'running' },
    ],
    [
      ['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
      ['0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')],
    ],
  );

  expect(ended).toBe(0);
  expect(ctx.readSessions()).toStrictEqual([
    { session_id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null },
    { session_id: '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa', active: 1, ended_at: null, ended_by: null },
  ]);
});

test('it leaves a run that is not working alone', () => {
  const ctx = setupTest();
  addRun(ctx.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(ctx.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  finalPr(ctx.db, 'kettle#71', { sha: 'abc1234', actor: 'z-delivery' });
  closePr(ctx.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:00:00Z', mergeSha: null } });
  setState(ctx.db, 'GEO-9901', 'blocked', { waitsOn: 'a teapot supplier' }, 'z-delivery');

  const ended = ctx.sweep([{ id: '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', state: 'done' }], [['0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Date.parse('2026-10-22T11:00:00Z')]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('blocked');
});
