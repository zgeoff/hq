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
