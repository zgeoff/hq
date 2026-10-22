import { expect, test } from 'bun:test';
import { buildReadyPage } from './build-ready-page.ts';
import { makeStateCall } from './make-state-call.ts';

test('it answers the Ready query with the Ready issues and any other state with the others', async () => {
  const call = makeStateCall([{ identifier: 'GEO-9801' }], [{ identifier: 'GEO-9802' }]);

  const ready = await call('query', { after: null, state: 'Ready' });
  const backlog = await call('query', { after: null, state: 'Backlog' });

  expect(ready).toStrictEqual(buildReadyPage([{ identifier: 'GEO-9801' }], null));
  expect(backlog).toStrictEqual(buildReadyPage([{ identifier: 'GEO-9802' }], null));
});
