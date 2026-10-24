import { expect, test } from 'bun:test';
import { waitFor } from './wait-for.ts';

test('it returns once the check holds, polling until then', async () => {
  const answers = [false, false, true];
  let checks = 0;

  await waitFor('the third check', () => answers[checks++] ?? false);

  expect(checks).toBe(3);
});

test('it waits on an async check', async () => {
  let checks = 0;

  await waitFor('the second check', () => Promise.resolve(++checks === 2));

  expect(checks).toBe(2);
});

test('it throws past its deadline, naming what it waited for', async () => {
  await expect(waitFor('the kettle to boil', () => false, { timeoutMs: 30 })).rejects.toThrow('waited 30 ms for the kettle to boil');
});
