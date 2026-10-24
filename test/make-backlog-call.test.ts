import { expect, test } from 'bun:test';
import { setImmediate } from 'node:timers/promises';
import { makeBacklogCall } from './make-backlog-call.ts';

test('it answers the Backlog query with the issues given, each complete, unblocked and with a Type label', async () => {
  const call = makeBacklogCall([{ identifier: 'GEO-9901', project: 'kettle roadmap', type: 'Bug', labels: ['atc'] }]);

  const answer = await call('query', { state: 'Backlog' });

  expect(answer).toStrictEqual({
    issues: {
      nodes: [
        {
          identifier: 'GEO-9901',
          title: 'whistle the kettle',
          description:
            '## Outcome\n\nThe kettle whistles.\n\n## Context\n\n- Project: kitchen\n\n## Scope\n\nIn: the whistle.\nOut: none stated.\n\n## Acceptance\n\n- [ ] The kettle whistles in a test (unit test)\n\n## Actions\n\nCode delivery\n',
          priority: 2,
          createdAt: '2026-10-01T00:00:00Z',
          project: { name: 'kettle roadmap', labels: { nodes: [] } },
          parent: null,
          labels: { nodes: [{ name: 'atc' }, { name: 'Bug', parent: { name: 'Type' } }] },
          inverseRelations: { nodes: [], pageInfo: { hasNextPage: false } },
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  });
});

test('it answers the Ready query with an empty page', async () => {
  const call = makeBacklogCall([{ identifier: 'GEO-9901', project: 'kettle roadmap', type: 'Bug' }]);

  const answer = await call('query', { state: 'Ready', after: null });

  expect(answer).toStrictEqual({ issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } });
});

test('it fails the Backlog query as an outage', () => {
  const call = makeBacklogCall('outage');

  expect(call('query', { state: 'Backlog' })).rejects.toThrow('invented outage');
});

test('it leaves the Backlog query unanswered when silent', async () => {
  const call = makeBacklogCall('silent');

  const first = await Promise.race([call('query', { state: 'Backlog' }).then(() => 'answered'), setImmediate().then(() => 'unanswered')]);

  expect(first).toBe('unanswered');
});
