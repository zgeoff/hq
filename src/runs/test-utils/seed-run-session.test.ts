import { expect, onTestFinished, test } from 'bun:test';
import { NOON_SYDNEY, at, freshDb } from '../../../test/helpers.ts';
import { seedRun } from './seed-run.ts';
import { seedRunSession } from './seed-run-session.ts';

function setupTest() {
  const fresh = freshDb();
  at(NOON_SYDNEY);
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readSessions: () => fresh.db.query('SELECT session_id, issue, active, helper, added_at FROM run_sessions').all() };
}

test('#seedRunSession attaches an active session to the run', () => {
  const ctx = setupTest();
  seedRun(ctx);

  seedRunSession(ctx);

  expect(ctx.readSessions()).toStrictEqual([{ session_id: 'a0000001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', issue: 'GEO-9001', active: 1, helper: 0, added_at: '2026-10-14T01:00:00Z' }]);
});

test('#seedRunSession applies input overrides', () => {
  const ctx = setupTest();
  seedRun(ctx, { issue: 'GEO-9002' });

  seedRunSession(ctx, { issue: 'GEO-9002', session: 'b0000002-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });

  expect(ctx.readSessions()).toMatchObject([{ session_id: 'b0000002-bbbb-4bbb-8bbb-bbbbbbbbbbbb', issue: 'GEO-9002' }]);
});
