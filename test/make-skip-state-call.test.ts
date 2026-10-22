import { expect, test } from 'bun:test';
import { buildReadyPage } from './build-ready-page.ts';
import { makeSkipStateCall } from './make-skip-state-call.ts';

test('it answers the Ready query with the Ready page', async () => {
  const call = makeSkipStateCall([{ identifier: 'GEO-9801' }], {});

  const answer = await call('query', { after: null, team: 'GEO', state: 'Ready' });

  expect(answer).toStrictEqual(buildReadyPage([{ identifier: 'GEO-9801' }], null));
});

test('it answers the state query with each asked issue it holds, and leaves out the rest', async () => {
  const call = makeSkipStateCall([], { 'GEO-9811': 'completed', 'GEO-9812': 'started' });

  const answer = await call('query', { ids: ['GEO-9811', 'GEO-9813'] });

  expect(answer).toStrictEqual({ issues: { nodes: [{ identifier: 'GEO-9811', previousIdentifiers: [], state: { type: 'completed' } }] } });
});

test('it rejects the state query only when given an Error', async () => {
  const call = makeSkipStateCall([{ identifier: 'GEO-9801' }], new Error('invented outage'));

  const ready = await call('query', { after: null, state: 'Ready' });

  expect(call('query', { ids: ['GEO-9811'] })).rejects.toThrow('invented outage');
  expect(ready).toStrictEqual(buildReadyPage([{ identifier: 'GEO-9801' }], null));
});
