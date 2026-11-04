import { expect, test } from 'bun:test';
import { buildReadyPage } from './build-ready-page.ts';
import { makeLabelsCall } from './make-labels-call.ts';

test('it answers an issue labels query with the labels', async () => {
  const call = makeLabelsCall(() => Promise.resolve(null), ['teapot']);

  await expect(call('query { issueLabels { nodes { name } } }', {})).resolves.toStrictEqual({ issueLabels: { nodes: [{ name: 'teapot', isGroup: false, parent: null }], pageInfo: { hasNextPage: false, endCursor: null } } });
});

test('it rejects an issue labels query during an outage', async () => {
  const call = makeLabelsCall(() => Promise.resolve(null), 'outage');

  await expect(call('query { issueLabels { nodes { name } } }', {})).rejects.toThrow('invented labels outage');
});

test('it leaves any other query to the call it wraps', async () => {
  const page = buildReadyPage([], null);
  const call = makeLabelsCall(() => Promise.resolve(page), ['teapot']);

  await expect(call('query { issues { nodes { identifier } } }', {})).resolves.toBe(page);
});
