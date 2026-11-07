import { expect, test } from 'bun:test';
import { makePagedLinearCall } from './make-paged-linear-call.ts';

test('it serves each page in turn, with a cursor to the next page and none after the last', async () => {
  const queries: string[] = [];
  const call = makePagedLinearCall([[{ identifier: 'GEO-9801' }], [{ identifier: 'GEO-9802' }]], queries);

  expect([await call('query one', { after: null }), await call('query two', { after: 'page-1' })]).toStrictEqual([
    { issues: { nodes: [{ identifier: 'GEO-9801' }], pageInfo: { hasNextPage: true, endCursor: 'page-1' } } },
    { issues: { nodes: [{ identifier: 'GEO-9802' }], pageInfo: { hasNextPage: false, endCursor: null } } },
  ]);
  expect(queries).toStrictEqual(['query one', 'query two']);
});

test('it rejects a cursor past the last page', () => {
  const call = makePagedLinearCall([[]], []);

  expect(call('query', { after: 'page-3' })).rejects.toThrow('no page 3 in a 1-page stand-in');
});
