import { expect, onTestFinished, test } from 'bun:test';
import { buildGithubAttachment } from '../../test/build-github-attachment.ts';
import { freshDb } from '../../test/helpers.ts';
import { makeThroughputLinearCall } from '../../test/make-throughput-linear-call.ts';
import { syncStarted } from './sync-started.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readPRs: () => fresh.db.query('SELECT issue, ref, status, merged_at FROM linear_started_prs ORDER BY issue, ref').all() };
}

test('it stores each In Progress issue with its PR attachments and replaces them on the next read', async () => {
  const ctx = setupTest();
  const at = new Date('2026-10-16T07:00:00Z');
  const first = makeThroughputLinearCall(
    [],
    [
      { identifier: 'GEO-9801', startedAt: '2026-10-14T07:00:00Z', attachments: [buildGithubAttachment(41, 'merged', '2026-10-15T01:00:00Z'), buildGithubAttachment(42, 'open'), { url: 'https://example.com', sourceType: 'slack', metadata: {} }] },
      { identifier: 'GEO-9802', startedAt: '2026-10-14T08:00:00Z' },
    ],
  );
  await syncStarted(ctx.db, first, at);
  const stored = ctx.readPRs();

  await syncStarted(ctx.db, makeThroughputLinearCall([], [{ identifier: 'GEO-9802', startedAt: '2026-10-14T08:00:00Z', attachments: [buildGithubAttachment(43, 'closed')] }]), at);

  expect({ stored, replaced: ctx.readPRs() }).toStrictEqual({
    stored: [
      { issue: 'GEO-9801', ref: 'kettle#41', status: 'merged', merged_at: '2026-10-15T01:00:00Z' },
      { issue: 'GEO-9801', ref: 'kettle#42', status: 'open', merged_at: null },
    ],
    replaced: [{ issue: 'GEO-9802', ref: 'kettle#43', status: 'closed', merged_at: null }],
  });
});

test('it asks Linear for the In Progress state by name, so an In Review issue is never read as started', async () => {
  const ctx = setupTest();
  const filters: (string | undefined)[] = [];
  const call = (query: string) => {
    filters.push(/filter: (?<filter>.*)\) \{/u.exec(query)?.groups?.['filter']);
    return Promise.resolve({ issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } });
  };

  await syncStarted(ctx.db, call, new Date('2026-10-16T07:00:00Z'));

  expect(filters).toStrictEqual(['{ state: { name: { eq: "In Progress" } } }']);
});

test('it asks for 50 issues a page, follows the cursor, and stores all 40 pages', async () => {
  const ctx = setupTest();
  const asked: { first: string | undefined; after: unknown }[] = [];
  const call = (query: string, variables: Record<string, unknown>) => {
    asked.push({ first: /issues\(first: (?<first>\d+)/u.exec(query)?.groups?.['first'], after: variables['after'] });
    const page = asked.length - 1;
    const nodes = Array.from({ length: 50 }, (_unused, index) => ({ identifier: `GEO-${10_000 + page * 50 + index}`, startedAt: '2026-10-14T07:00:00Z', updatedAt: '2026-10-14T07:00:00Z' }));
    return Promise.resolve({ issues: { nodes, pageInfo: { hasNextPage: page < 39, endCursor: `cursor-${page}` } } });
  };

  const stored = await syncStarted(ctx.db, call, new Date('2026-10-16T07:00:00Z'));

  expect({ stored, pages: asked.length, sizes: [...new Set(asked.map((ask) => ask.first))], cursors: asked.slice(0, 3).map((ask) => ask.after) }).toStrictEqual({
    stored: 2000,
    pages: 40,
    sizes: ['50'],
    cursors: [null, 'cursor-0', 'cursor-1'],
  });
});

test('it refuses a 41st page and keeps the last read as it was', async () => {
  const ctx = setupTest();
  await syncStarted(ctx.db, makeThroughputLinearCall([], [{ identifier: 'GEO-9809', startedAt: '2026-10-14T07:00:00Z', attachments: [buildGithubAttachment(49, 'open')] }]), new Date('2026-10-15T07:00:00Z'));
  let pages = 0;
  const call = (_query: string, variables: Record<string, unknown>) => {
    pages += 1;
    const node = { identifier: `GEO-${String(variables['after'] ?? 'first')}`, startedAt: '2026-10-14T07:00:00Z', updatedAt: '2026-10-14T07:00:00Z' };
    return Promise.resolve({ issues: { nodes: [node], pageInfo: { hasNextPage: true, endCursor: 'more' } } });
  };

  await expect(syncStarted(ctx.db, call, new Date('2026-10-16T07:00:00Z'))).rejects.toMatchObject({ code: 'linear_failed', message: 'more than 2000 issues In Progress; not recorded' });
  expect(pages).toBe(40);
  expect({ started: ctx.db.query('SELECT issue FROM linear_started').all(), prs: ctx.readPRs() }).toStrictEqual({
    started: [{ issue: 'GEO-9809' }],
    prs: [{ issue: 'GEO-9809', ref: 'kettle#49', status: 'open', merged_at: null }],
  });
});

test('it reads every attachment page, so an open PR after 20 merged ones keeps the issue live', async () => {
  const ctx = setupTest();
  const merged = Array.from({ length: 20 }, (_unused, index) => buildGithubAttachment(index + 1, 'merged', '2026-10-15T01:00:00Z'));
  const call = (query: string, variables: Record<string, unknown>) => {
    if (query.includes('issue(id:')) {
      return Promise.resolve({ issue: { attachments: { nodes: [buildGithubAttachment(21, 'open')], pageInfo: { hasNextPage: false, endCursor: null } } } });
    }
    expect(variables['after']).toBeNull();
    const node = { identifier: 'GEO-9810', startedAt: '2026-10-14T07:00:00Z', updatedAt: '2026-10-14T07:00:00Z', attachments: { nodes: merged, pageInfo: { hasNextPage: true, endCursor: 'att-1' } } };
    return Promise.resolve({ issues: { nodes: [node], pageInfo: { hasNextPage: false, endCursor: null } } });
  };

  await syncStarted(ctx.db, call, new Date('2026-10-16T07:00:00Z'));

  expect(ctx.db.query("SELECT status, COUNT(*) AS prs FROM linear_started_prs WHERE issue = 'GEO-9810' GROUP BY status ORDER BY status").all()).toStrictEqual([
    { status: 'merged', prs: 20 },
    { status: 'open', prs: 1 },
  ]);
});
