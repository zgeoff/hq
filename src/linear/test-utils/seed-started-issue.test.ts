import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedStartedIssue } from './seed-started-issue.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readStarted: () => fresh.db.query('SELECT issue, started_at, fetched_at FROM linear_started ORDER BY issue').all() };
}

test('#seedStartedIssue stores a started issue, and input overrides apply', () => {
  const ctx = setupTest();

  seedStartedIssue(ctx, { issue: 'GEO-9', started_at: '2026-10-12T01:00:00Z' });

  expect(ctx.readStarted()).toStrictEqual([{ issue: 'GEO-9', started_at: '2026-10-12T01:00:00Z', fetched_at: '2026-10-16T01:00:00Z' }]);
});

test('#seedStartedIssue refuses a second row for the same issue', () => {
  const ctx = setupTest();
  seedStartedIssue(ctx, { issue: 'GEO-9' });

  expect(() => seedStartedIssue(ctx, { issue: 'GEO-9' })).toThrow();
});
