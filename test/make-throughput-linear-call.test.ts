import { expect, test } from 'bun:test';
import { buildFiledNode } from './build-filed-node.ts';
import { makeThroughputLinearCall } from './make-throughput-linear-call.ts';

test('it answers the filed query, the In Progress query and any other query, each in one page', async () => {
  const filed = buildFiledNode('GEO-9801', null);
  const call = makeThroughputLinearCall([filed], [{ identifier: 'GEO-9802', startedAt: '2026-10-14T07:00:00Z' }]);

  expect([await call('issues(filter: { createdAt: { gte: $from } })', {}), await call('issues(filter: { state: { type: { eq: "started" } } })', {}), await call('issues(filter: { completedAt: {} })', {})]).toStrictEqual([
    { issues: { nodes: [filed], pageInfo: { hasNextPage: false, endCursor: null } } },
    { issues: { nodes: [{ identifier: 'GEO-9802', startedAt: '2026-10-14T07:00:00Z', updatedAt: '2026-10-14T07:00:00Z' }], pageInfo: { hasNextPage: false, endCursor: null } } },
    { issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } },
  ]);
});

test('it nests an In Progress issue\'s attachments under attachments.nodes, and leaves the key out of one with none', async () => {
  const attachment = { url: 'https://github.com/zgeoff/kettle/pull/41', sourceType: 'github', metadata: { status: 'open' } };
  const call = makeThroughputLinearCall([], [{ identifier: 'GEO-9802', startedAt: '2026-10-14T07:00:00Z', attachments: [attachment] }]);

  expect(await call('issues(filter: { state: { type: { eq: "started" } } })', {})).toStrictEqual({
    issues: { nodes: [{ identifier: 'GEO-9802', startedAt: '2026-10-14T07:00:00Z', updatedAt: '2026-10-14T07:00:00Z', attachments: { nodes: [attachment] } }], pageInfo: { hasNextPage: false, endCursor: null } },
  });
});
