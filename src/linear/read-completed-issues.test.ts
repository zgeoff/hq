import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { readCompletedIssues } from './read-completed-issues.ts';
import { writeIssues } from './write-issues.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it reads only the stored issues that Linear reports completed', () => {
  const ctx = setupTest();
  writeIssues(ctx.db, [
    { issue: 'GEO-41', type: 'Design', title: 'Sketch the kettle lid', state: 'completed', closed_at: '2026-10-21T09:00:00Z' },
    { issue: 'GEO-42', type: 'Bug', title: 'The kettle leaks', state: 'open', closed_at: null },
    { issue: 'GEO-43', type: 'Feature', title: 'Teach the kettle to sing', state: 'canceled', closed_at: '2026-10-21T10:00:00Z' },
  ]);

  expect(readCompletedIssues(ctx.db)).toStrictEqual(new Set(['GEO-41']));
});

test('it reads an empty set when no issue was stored', () => {
  const ctx = setupTest();

  expect(readCompletedIssues(ctx.db)).toStrictEqual(new Set());
});
