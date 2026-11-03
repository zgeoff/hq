import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { endHandedInRunSessions } from './end-handed-in-run-sessions.ts';
import { setSession } from './set-session.ts';
import { setState } from './set-state.ts';

const MAIN = '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HELPER = '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AT = new Date('2026-10-22T12:00:00Z');
const OLD_MS = Date.parse('2026-10-22T11:30:00Z');
const RECENT_MS = Date.parse('2026-10-22T11:55:00Z');

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  addRun(fresh.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: MAIN, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(fresh.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  fresh.db.query("UPDATE run_prs SET final_sha = 'abc1234' WHERE ref = 'kettle#71'").run();
  closePr(fresh.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:30:00Z', mergeSha: null } });
  return {
    db: fresh.db,
    addHelper: () => setSession(fresh.db, 'GEO-9901', HELPER, 'z-delivery', 'add'),
    sweep: (sessions: { id: string; state: string }[], activity: [string, number | null][]) =>
      endHandedInRunSessions(fresh.db, sessions.map((session) => ({ ...session, alive: true })), new Map(activity), 'z-delivery', AT),
    readState: () => z.object({ state: z.string() }).parse(fresh.db.query("SELECT state FROM runs WHERE issue = 'GEO-9901'").get()).state,
    readSessions: () => fresh.db.query('SELECT session_id, active, ended_at, ended_by FROM run_sessions ORDER BY session_id').all(),
  };
}

test('it ends the sessions of a handed-in run, helpers included, and moves the run to merged', () => {
  const ctx = setupTest();
  ctx.addHelper();

  const ended = ctx.sweep(
    [
      { id: MAIN, state: 'done' },
      { id: HELPER, state: 'done' },
    ],
    [
      [MAIN, OLD_MS],
      [HELPER, OLD_MS],
    ],
  );

  expect(ended).toBe(2);
  expect(ctx.readSessions()).toStrictEqual([
    { session_id: MAIN, active: 0, ended_at: '2026-10-22T12:00:00Z', ended_by: 'sweep' },
    { session_id: HELPER, active: 0, ended_at: '2026-10-22T12:00:00Z', ended_by: 'sweep' },
  ]);
  expect(ctx.readState()).toBe('merged');
  expect(ctx.db.query("SELECT subject_id, data FROM events WHERE action = 'handed-in-ended'").all()).toStrictEqual([{ subject_id: 'GEO-9901', data: JSON.stringify({ sessions: [MAIN, HELPER] }) }]);
});

test('it keeps the sessions of a run that still has an open PR', () => {
  const ctx = setupTest();
  addPr(ctx.db, 'GEO-9901', 'kettle#72', 'z-delivery');

  const ended = ctx.sweep([{ id: MAIN, state: 'done' }], [[MAIN, OLD_MS]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose merged PR has no final', () => {
  const ctx = setupTest();
  ctx.db.query("UPDATE run_prs SET final_sha = NULL WHERE ref = 'kettle#71'").run();

  const ended = ctx.sweep([{ id: MAIN, state: 'done' }], [[MAIN, OLD_MS]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose last merge is under ten minutes old', () => {
  const ctx = setupTest();
  ctx.db.query("UPDATE run_prs SET merged_at = '2026-10-22T11:55:00Z' WHERE ref = 'kettle#71'").run();

  const ended = ctx.sweep([{ id: MAIN, state: 'done' }], [[MAIN, OLD_MS]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose merged PR was merged without a time', () => {
  const ctx = setupTest();
  ctx.db.query("UPDATE run_prs SET merged_at = NULL WHERE ref = 'kettle#71'").run();

  const ended = ctx.sweep([{ id: MAIN, state: 'done' }], [[MAIN, OLD_MS]]);

  expect(ended).toBe(0);
});

test.each([
  ['a running session', 'running', OLD_MS],
  ['a session that needs the owner', 'needs_you', OLD_MS],
  ['a done session with recent activity', 'done', RECENT_MS],
  ['a done session with no activity reading', 'done', null],
] as const)('it keeps the sessions of a run with %s', (_name, state, activity) => {
  const ctx = setupTest();

  const ended = ctx.sweep([{ id: MAIN, state }], [[MAIN, activity]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose session atc does not list', () => {
  const ctx = setupTest();

  const ended = ctx.sweep([], [[MAIN, OLD_MS]]);

  expect(ended).toBe(0);
});

test('it keeps every session of a run while its helper session is running', () => {
  const ctx = setupTest();
  ctx.addHelper();

  const ended = ctx.sweep(
    [
      { id: MAIN, state: 'done' },
      { id: HELPER, state: 'running' },
    ],
    [
      [MAIN, OLD_MS],
      [HELPER, OLD_MS],
    ],
  );

  expect(ended).toBe(0);
  expect(ctx.readSessions()).toStrictEqual([
    { session_id: MAIN, active: 1, ended_at: null, ended_by: null },
    { session_id: HELPER, active: 1, ended_at: null, ended_by: null },
  ]);
});

test('it leaves a run that is not working alone', () => {
  const ctx = setupTest();
  setState(ctx.db, 'GEO-9901', 'blocked', { waitsOn: 'a teapot supplier' }, 'z-delivery');

  const ended = ctx.sweep([{ id: MAIN, state: 'done' }], [[MAIN, OLD_MS]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('blocked');
});
