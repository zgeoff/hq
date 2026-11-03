import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { freshDb } from '../../test/helpers.ts';
import { addPr } from './add-pr.ts';
import { addRun } from './add-run.ts';
import { closePr } from './close-pr.ts';
import { endHandedInRunSessions } from './end-handed-in-run-sessions.ts';
import { setSession } from './set-session.ts';
import { setState } from './set-state.ts';

function setupTest() {
  const main = '0000e001-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const helper = '0000e002-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const at = new Date('2026-10-22T12:00:00Z');
  const oldMs = Date.parse('2026-10-22T11:30:00Z');
  const recentMs = Date.parse('2026-10-22T11:55:00Z');
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  addRun(fresh.db, { issue: 'GEO-9901', title: 'Invented kettle work', place: 'imp', session: main, next: 'Agent working.', gate: null, geoffChat: false, lane: 'cloud', actor: 'z-delivery' });
  addPr(fresh.db, 'GEO-9901', 'kettle#71', 'z-delivery');
  fresh.db.query("UPDATE run_prs SET final_sha = 'abc1234' WHERE ref = 'kettle#71'").run();
  closePr(fresh.db, 'kettle#71', { to: 'merged', actor: 'hq-github', facts: { mergedAt: '2026-10-22T11:30:00Z', mergeSha: null } });
  return {
    db: fresh.db,
    main,
    helper,
    oldMs,
    recentMs,
    addHelper: () => setSession(fresh.db, 'GEO-9901', helper, 'z-delivery', 'add'),
    sweep: (sessions: { id: string; state: string }[], activity: [string, number | null][]) =>
      endHandedInRunSessions(fresh.db, { sessions: sessions.map((session) => ({ ...session, alive: true })), activity: new Map(activity) }, 'z-delivery', at),
    readState: () => z.object({ state: z.string() }).parse(fresh.db.query("SELECT state FROM runs WHERE issue = 'GEO-9901'").get()).state,
    readSessions: () => fresh.db.query('SELECT session_id, active, ended_at, ended_by FROM run_sessions ORDER BY session_id').all(),
  };
}

test('it ends the sessions of a handed-in run, helpers included, and moves the run to merged', () => {
  const ctx = setupTest();
  ctx.addHelper();

  const ended = ctx.sweep(
    [
      { id: ctx.main, state: 'done' },
      { id: ctx.helper, state: 'done' },
    ],
    [
      [ctx.main, ctx.oldMs],
      [ctx.helper, ctx.oldMs],
    ],
  );

  expect(ended).toBe(2);
  expect(ctx.readSessions()).toStrictEqual([
    { session_id: ctx.main, active: 0, ended_at: '2026-10-22T12:00:00Z', ended_by: 'sweep' },
    { session_id: ctx.helper, active: 0, ended_at: '2026-10-22T12:00:00Z', ended_by: 'sweep' },
  ]);
  expect(ctx.readState()).toBe('merged');
  expect(ctx.db.query("SELECT subject_id, data FROM events WHERE action = 'handed-in-ended'").all()).toStrictEqual([{ subject_id: 'GEO-9901', data: JSON.stringify({ sessions: [ctx.main, ctx.helper] }) }]);
});

test('it keeps the sessions of a run that still has an open PR', () => {
  const ctx = setupTest();
  addPr(ctx.db, 'GEO-9901', 'kettle#72', 'z-delivery');

  const ended = ctx.sweep([{ id: ctx.main, state: 'done' }], [[ctx.main, ctx.oldMs]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose merged PR has no final', () => {
  const ctx = setupTest();
  ctx.db.query("UPDATE run_prs SET final_sha = NULL WHERE ref = 'kettle#71'").run();

  const ended = ctx.sweep([{ id: ctx.main, state: 'done' }], [[ctx.main, ctx.oldMs]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose last merge is under ten minutes old', () => {
  const ctx = setupTest();
  ctx.db.query("UPDATE run_prs SET merged_at = '2026-10-22T11:55:00Z' WHERE ref = 'kettle#71'").run();

  const ended = ctx.sweep([{ id: ctx.main, state: 'done' }], [[ctx.main, ctx.oldMs]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose merged PR was merged without a time', () => {
  const ctx = setupTest();
  ctx.db.query("UPDATE run_prs SET merged_at = NULL WHERE ref = 'kettle#71'").run();

  const ended = ctx.sweep([{ id: ctx.main, state: 'done' }], [[ctx.main, ctx.oldMs]]);

  expect(ended).toBe(0);
});

test.each([
  ['a running session', 'running', 'old'],
  ['a session that needs the owner', 'needs_you', 'old'],
  ['a done session with recent activity', 'done', 'recent'],
  ['a done session with no activity reading', 'done', 'none'],
] as const)('it keeps the sessions of a run with %s', (_name, state, activity) => {
  const ctx = setupTest();
  const lastMs = { old: ctx.oldMs, recent: ctx.recentMs, none: null }[activity];

  const ended = ctx.sweep([{ id: ctx.main, state }], [[ctx.main, lastMs]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('working');
});

test('it keeps the sessions of a run whose session atc does not list', () => {
  const ctx = setupTest();

  const ended = ctx.sweep([], [[ctx.main, ctx.oldMs]]);

  expect(ended).toBe(0);
});

test('it keeps every session of a run while its helper session is running', () => {
  const ctx = setupTest();
  ctx.addHelper();

  const ended = ctx.sweep(
    [
      { id: ctx.main, state: 'done' },
      { id: ctx.helper, state: 'running' },
    ],
    [
      [ctx.main, ctx.oldMs],
      [ctx.helper, ctx.oldMs],
    ],
  );

  expect(ended).toBe(0);
  expect(ctx.readSessions()).toStrictEqual([
    { session_id: ctx.main, active: 1, ended_at: null, ended_by: null },
    { session_id: ctx.helper, active: 1, ended_at: null, ended_by: null },
  ]);
});

test('it leaves a run that is not working alone', () => {
  const ctx = setupTest();
  setState(ctx.db, 'GEO-9901', 'blocked', { waitsOn: 'a teapot supplier' }, 'z-delivery');

  const ended = ctx.sweep([{ id: ctx.main, state: 'done' }], [[ctx.main, ctx.oldMs]]);

  expect(ended).toBe(0);
  expect(ctx.readState()).toBe('blocked');
});
