import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { makeThroughputLinearCall } from '../../test/make-throughput-linear-call.ts';
import { syncInReview } from './sync-in-review.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRows: () => fresh.db.query('SELECT issue, updated_at, fetched_at FROM linear_in_review ORDER BY issue').all() };
}

test('it stores each In Review issue with its update time and replaces them on the next read', async () => {
  const ctx = setupTest();
  const at = new Date('2026-10-16T07:00:00Z');
  const inReview = [
    { identifier: 'GEO-9801', updatedAt: '2026-10-14T07:00:00Z' },
    { identifier: 'GEO-9802', updatedAt: '2026-10-15T07:00:00Z' },
  ];
  const count = await syncInReview(ctx.db, makeThroughputLinearCall([], [], inReview), at);
  expect(count).toBe(2);
  const stored = ctx.readRows();

  await syncInReview(ctx.db, makeThroughputLinearCall([], [], inReview.slice(1)), at);

  expect({ stored, replaced: ctx.readRows() }).toStrictEqual({
    stored: [
      { issue: 'GEO-9801', updated_at: '2026-10-14T07:00:00Z', fetched_at: '2026-10-16T07:00:00Z' },
      { issue: 'GEO-9802', updated_at: '2026-10-15T07:00:00Z', fetched_at: '2026-10-16T07:00:00Z' },
    ],
    replaced: [{ issue: 'GEO-9802', updated_at: '2026-10-15T07:00:00Z', fetched_at: '2026-10-16T07:00:00Z' }],
  });
});

test('it asks Linear for the In Review state by name, 50 issues a page, and follows the cursor', async () => {
  const ctx = setupTest();
  const queries: string[] = [];
  const call = (query: string, variables: Record<string, unknown>) => {
    queries.push(query);
    const first = variables['after'] === null;
    return Promise.resolve({
      issues: {
        nodes: [{ identifier: first ? 'GEO-9801' : 'GEO-9802', updatedAt: '2026-10-14T07:00:00Z' }],
        pageInfo: { hasNextPage: first, endCursor: first ? 'c1' : null },
      },
    });
  };

  const count = await syncInReview(ctx.db, call, new Date('2026-10-16T07:00:00Z'));
  expect(count).toBe(2);
  expect(queries).toHaveLength(2);
  expect(queries[0]).toContain('first: 50');
  expect(queries[0]).toContain('filter: { state: { name: { eq: "In Review" } } }');
});

const call = () => Promise.resolve({ issues: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'c' } } });

test('it rejects when more than 40 pages are In Review, and keeps the earlier rows', async () => {
  const ctx = setupTest();
  ctx.db.query("INSERT INTO linear_in_review (issue, updated_at, fetched_at) VALUES ('GEO-9800', '2026-10-14T07:00:00Z', '2026-10-15T07:00:00Z')").run();
  await expect(syncInReview(ctx.db, call, new Date('2026-10-16T07:00:00Z'))).rejects.toThrow(/more than 2000 issues In Review/u);
  expect(ctx.readRows()).toStrictEqual([{ issue: 'GEO-9800', updated_at: '2026-10-14T07:00:00Z', fetched_at: '2026-10-15T07:00:00Z' }]);
});
