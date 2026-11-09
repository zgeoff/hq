import { expect, mock, onTestFinished, test } from 'bun:test';
import { HttpResponse, http } from 'msw';
import { LINEAR_GRAPHQL_URL } from '../../mocks/linear-handlers.ts';
import { server } from '../../mocks/node.ts';
import { freshDb } from '../../test/helpers.ts';
import { overrideEnv } from '../config/override-env.ts';
import { makeLinearCaller } from './make-linear-caller.ts';
import { resetKey } from './reset-key.ts';
import { syncInReview } from './sync-in-review.ts';
import { buildSeeder } from '../test-utils/build-seeder.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  resetKey();
  onTestFinished(resetKey);
  onTestFinished(overrideEnv('OP_SERVICE_ACCOUNT_TOKEN', 'invented-token'));
  return {
    db: fresh.db,
    seed: buildSeeder(fresh),
    call: makeLinearCaller(() => Promise.resolve({ code: 0, stdout: 'lin_api_INVENTED\n', stderr: '' })),
    readRows: () => fresh.db.query('SELECT issue, updated_at, fetched_at FROM linear_in_review ORDER BY issue').all(),
  };
}

test('it stores each In Review issue with its update time and replaces them on the next read', async () => {
  const ctx = setupTest();
  const at = new Date('2026-10-16T07:00:00Z');
  const both = { data: { issues: { nodes: [{ identifier: 'GEO-9801', updatedAt: '2026-10-14T07:00:00Z' }, { identifier: 'GEO-9802', updatedAt: '2026-10-15T07:00:00Z' }], pageInfo: { hasNextPage: false, endCursor: null } } } };
  const one = { data: { issues: { nodes: [{ identifier: 'GEO-9802', updatedAt: '2026-10-15T07:00:00Z' }], pageInfo: { hasNextPage: false, endCursor: null } } } };
  server.use(http.post(LINEAR_GRAPHQL_URL, () => HttpResponse.json(both), { once: true }), http.post(LINEAR_GRAPHQL_URL, () => HttpResponse.json(one), { once: true }));
  const count = await syncInReview(ctx.db, ctx.call, at);
  expect(count).toBe(2);
  const stored = ctx.readRows();

  await syncInReview(ctx.db, ctx.call, at);

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
  const asked = mock<(body: unknown) => void>();
  const first = { data: { issues: { nodes: [{ identifier: 'GEO-9801', updatedAt: '2026-10-14T07:00:00Z' }], pageInfo: { hasNextPage: true, endCursor: 'c1' } } } };
  const second = { data: { issues: { nodes: [{ identifier: 'GEO-9802', updatedAt: '2026-10-14T07:00:00Z' }], pageInfo: { hasNextPage: false, endCursor: null } } } };
  server.use(
    http.post(
      LINEAR_GRAPHQL_URL,
      async (info) => {
        const body: unknown = await info.request.json();
        asked(body);
        return HttpResponse.json(first);
      },
      { once: true },
    ),
    http.post(
      LINEAR_GRAPHQL_URL,
      async (info) => {
        const body: unknown = await info.request.json();
        asked(body);
        return HttpResponse.json(second);
      },
      { once: true },
    ),
  );

  const count = await syncInReview(ctx.db, ctx.call, new Date('2026-10-16T07:00:00Z'));

  expect({ count, asked: asked.mock.calls }).toStrictEqual({
    count: 2,
    asked: [
      [{ query: expect.stringContaining('issues(first: 50, after: $after, filter: { state: { name: { eq: "In Review" } } })'), variables: { after: null } }],
      [{ query: expect.stringContaining('issues(first: 50, after: $after, filter: { state: { name: { eq: "In Review" } } })'), variables: { after: 'c1' } }],
    ],
  });
});

test('it rejects when more than 40 pages are In Review, and keeps the earlier rows', async () => {
  const ctx = setupTest();
  ctx.seed.inReviewIssue({ issue: 'GEO-9800', updatedAt: '2026-10-14T07:00:00Z', fetchedAt: '2026-10-15T07:00:00Z' });
  server.use(http.post(LINEAR_GRAPHQL_URL, () => HttpResponse.json({ data: { issues: { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'c' } } } })));

  await expect(syncInReview(ctx.db, ctx.call, new Date('2026-10-16T07:00:00Z'))).rejects.toThrow(/more than 2000 issues In Review/u);
  expect(ctx.readRows()).toStrictEqual([{ issue: 'GEO-9800', updated_at: '2026-10-14T07:00:00Z', fetched_at: '2026-10-15T07:00:00Z' }]);
});
