import { expect, test } from 'bun:test';
import { buildReadyPage, makePagedCall } from './build-ready-page.ts';

test('it shapes seeds as Linear answers, with no project, labels or parent by default', () => {
  const page = buildReadyPage([{ identifier: 'GEO-1' }, { identifier: 'GEO-2', project: 'invented project', labels: ['invented label'], parent: 'GEO-1' }], null);

  expect(page).toStrictEqual({
    issues: {
      nodes: [
        { identifier: 'GEO-1', project: null, labels: { nodes: [] }, parent: null },
        { identifier: 'GEO-2', project: { name: 'invented project' }, labels: { nodes: [{ name: 'invented label' }] }, parent: { identifier: 'GEO-1' } },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  });
});

test('it says another page follows when it has a cursor', () => {
  expect(buildReadyPage([], 'cursor-1').issues.pageInfo).toStrictEqual({ hasNextPage: true, endCursor: 'cursor-1' });
});

test('it answers the first page, then the second, and rejects an Error answer', async () => {
  const first = buildReadyPage([{ identifier: 'GEO-1' }], 'cursor-1');
  const second = buildReadyPage([{ identifier: 'GEO-2' }], null);
  const call = makePagedCall(first, new Error('invented outage'));
  const answeredFirst = await call('query', { after: null });
  const answeredSecond = await makePagedCall(first, second)('query', { after: 'cursor-1' });
  const answeredRepeat = await makePagedCall(second)('query', { after: 'cursor-1' });

  expect(answeredFirst).toBe(first);
  await expect(call('query', { after: 'cursor-1' })).rejects.toThrow('invented outage');
  expect(answeredSecond).toBe(second);
  expect(answeredRepeat).toBe(second);
});

test('it resolves a malformed answer as given', async () => {
  const malformed = { issues: { nodes: [{ identifier: 7 }] } };

  const answered = await makePagedCall(buildReadyPage([], 'cursor-1'), malformed)('query', { after: 'cursor-1' });

  expect(answered).toBe(malformed);
});
