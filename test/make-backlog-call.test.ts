import { expect, test } from 'bun:test';
import { setImmediate } from 'node:timers/promises';
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

test('it fails the Backlog query as an outage', async () => {
  const call = makeBacklogCall('outage');

  await expect(call('query', { state: 'Backlog' })).rejects.toThrow('invented outage');
});

test('it leaves the Backlog query unanswered when silent', async () => {
  const call = makeBacklogCall('silent');

  const first = await Promise.race([call('query', { state: 'Backlog' }).then(() => 'answered'), setImmediate().then(() => 'unanswered')]);

  expect(first).toBe('unanswered');
});
