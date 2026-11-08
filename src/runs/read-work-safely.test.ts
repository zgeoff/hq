import { expect, test } from 'bun:test';
import { readWorkSafely } from './read-work-safely.ts';

test('it returns the work the check read', async () => {
  const work = await readWorkSafely(() => Promise.resolve({ state: 'unpushed', detail: 'one commit' }), { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false });

  expect(work).toStrictEqual({ state: 'unpushed', detail: 'one commit' });
});

test('it returns unknown work with the error when the check fails', async () => {
  const work = await readWorkSafely(() => Promise.reject(new Error('imp asleep')), { id: '0000f001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'kettle-agent', alive: false });

  expect(work).toStrictEqual({ state: 'unknown', detail: 'imp asleep' });
});
