import { expect, onTestFinished, test } from 'bun:test';
import { at, freshDb } from '../../../test/helpers.ts';
import { seedLinearIssue } from './seed-linear-issue.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  at('2026-10-16T00:00:00Z');
  return { db: fresh.db, readIssues: () => fresh.db.query('SELECT issue, type, title, state, closed_at, fetched_at FROM linear_issues ORDER BY issue').all() };
}

test('#seedLinearIssue stores an issue fetched now, and input overrides apply', () => {
  const ctx = setupTest();

  seedLinearIssue(ctx, { issue: 'GEO-9', type: 'Bug', state: 'canceled', closed_at: '2026-10-15T01:00:00Z' });

  expect(ctx.readIssues()).toStrictEqual([{ issue: 'GEO-9', type: 'Bug', title: 'Descale the kettle', state: 'canceled', closed_at: '2026-10-15T01:00:00Z', fetched_at: '2026-10-16T00:00:00Z' }]);
});

test('#seedLinearIssue replaces the issue a key already holds', () => {
  const ctx = setupTest();
  seedLinearIssue(ctx, { issue: 'GEO-9', type: 'Bug' });

  seedLinearIssue(ctx, { issue: 'GEO-9', type: 'Feature' });

  expect(ctx.readIssues()).toMatchObject([{ issue: 'GEO-9', type: 'Feature' }]);
});
