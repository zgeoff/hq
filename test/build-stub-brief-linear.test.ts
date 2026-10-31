import { expect, test } from 'bun:test';
import { buildStubBriefLinear } from './build-stub-brief-linear.ts';

test('it answers a held issue with its description and labels, a label group as the parent name', async () => {
  const stub = buildStubBriefLinear({ 'GEO-9001': { description: '## Outcome\n\nBoil.', labels: [{ name: 'Bug', parent: 'Type' }, { name: 'hq' }] } });

  const answer = await stub.call('query', { identifier: 'GEO-9001' });

  expect(answer).toStrictEqual({ issue: { identifier: 'GEO-9001', description: '## Outcome\n\nBoil.', labels: { nodes: [{ name: 'Bug', parent: { name: 'Type' } }, { name: 'hq', parent: null }] } } });
});

test('it answers an issue it does not hold with null, and keeps each id asked in order', async () => {
  const stub = buildStubBriefLinear({ 'GEO-9001': { description: null, labels: [] } });

  const answer = await stub.call('query', { identifier: 'GEO-9099' });
  await stub.call('query', { identifier: 'GEO-9001' });

  expect(answer).toStrictEqual({ issue: null });
  expect(stub.asked).toStrictEqual(['GEO-9099', 'GEO-9001']);
});
