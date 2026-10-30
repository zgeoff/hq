import { expect, test } from 'bun:test';
import { buildStubLinearDescriptions } from './build-stub-linear-descriptions.ts';

test('it answers an id query with each named issue the map holds, in order, and leaves an unknown id out', async () => {
  const stub = buildStubLinearDescriptions({ 'GEO-9001': '- [ ] widgets', 'GEO-9002': '' });

  const answer = await stub.call('query', { ids: ['GEO-9002', 'GEO-9099', 'GEO-9001'] });

  expect(answer).toStrictEqual({ issues: { nodes: [{ identifier: 'GEO-9002', description: '' }, { identifier: 'GEO-9001', description: '- [ ] widgets' }] } });
});

test('it keeps the id list of each id query in order, and nothing for other queries', async () => {
  const stub = buildStubLinearDescriptions({});

  await stub.call('query', { ids: ['GEO-9001'] });
  await stub.call('query', { after: null });
  await stub.call('query', { ids: ['GEO-9002', 'GEO-9003'] });

  expect(stub.asked).toStrictEqual([['GEO-9001'], ['GEO-9002', 'GEO-9003']]);
});

test('it answers a query with no id list with an empty page', async () => {
  const stub = buildStubLinearDescriptions({ 'GEO-9001': '- [ ] widgets' });

  const answer = await stub.call('query', { after: null, from: '2026-10-14T00:00:00Z' });

  expect(answer).toStrictEqual({ issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } });
});
