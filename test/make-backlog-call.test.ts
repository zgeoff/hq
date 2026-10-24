import { expect, test } from 'bun:test';
import { makeBacklogCall } from './make-backlog-call.ts';

test('it answers the Backlog query with the issues given, each with a Type label', async () => {
  const call = makeBacklogCall([{ identifier: 'GEO-9901', project: 'kettle roadmap', type: 'Bug', labels: ['atc'] }]);

  const answer = await call('query', { state: 'Backlog' });

  expect(answer).toMatchObject({ issues: { nodes: [{ identifier: 'GEO-9901', project: { name: 'kettle roadmap' }, labels: { nodes: [{ name: 'atc' }, { name: 'Bug', parent: { name: 'Type' } }] } }] } });
});

test('it answers the Ready query with an empty page', async () => {
  const call = makeBacklogCall([{ identifier: 'GEO-9901', project: 'kettle roadmap', type: 'Bug' }]);

  const answer = await call('query', { state: 'Ready', after: null });

  expect(answer).toMatchObject({ issues: { nodes: [] } });
});

test('it fails the Backlog query when given null', async () => {
  const call = makeBacklogCall(null);

  await expect(call('query', { state: 'Backlog' })).rejects.toThrow('invented outage');
});
