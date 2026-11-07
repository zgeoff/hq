import { expect, test } from 'bun:test';
import { settleRestores } from './settle-restores.ts';

test('it reports a failed entry that is not an object as down with empty fields', async () => {
  const settled = await settleRestores([null], () => Promise.resolve([]),{ timeoutMs: 0, pollMs: 0 });

  expect(settled).toStrictEqual({ late: [], down: [{ id: '', name: '', reason: '' }] });
});
