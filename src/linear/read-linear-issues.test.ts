import { expect, onTestFinished, test } from 'bun:test';
import { updateEnv } from '@zgeoff/testing/helpers';
import { freshDb } from '../../test/helpers.ts';
import { readLinearIssues } from './read-linear-issues.ts';
import { writeIssues } from './write-issues.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it reads every stored Linear issue, ordered by issue', () => {
  const ctx = setupTest();
  updateEnv('HQ_NOW', '2026-10-22T03:00:00Z');
  writeIssues(ctx.db, [
    { issue: 'GEO-7', type: 'Bug', title: 'The kettle leaks', state: 'open', closed_at: null },
    { issue: 'GEO-3', type: 'Feature', title: 'Teach the kettle to whistle', state: 'completed', closed_at: '2026-10-21T09:00:00Z' },
  ]);

  expect(readLinearIssues(ctx.db)).toStrictEqual([
    { issue: 'GEO-3', type: 'Feature', title: 'Teach the kettle to whistle', state: 'completed', closed_at: '2026-10-21T09:00:00Z', fetched_at: '2026-10-22T03:00:00Z' },
    { issue: 'GEO-7', type: 'Bug', title: 'The kettle leaks', state: 'open', closed_at: null, fetched_at: '2026-10-22T03:00:00Z' },
  ]);
});

test('it reads no rows when no issue was stored', () => {
  const ctx = setupTest();

  expect(readLinearIssues(ctx.db)).toStrictEqual([]);
});
