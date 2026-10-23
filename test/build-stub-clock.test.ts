import { expect, test } from 'bun:test';
import { buildStubClock } from './build-stub-clock.ts';

test('it starts at the given time and stands still while nothing sleeps', () => {
  const clock = buildStubClock(1000);

  expect([clock.now(), clock.now()]).toStrictEqual([1000, 1000]);
});

test('it moves its time on by each pause and records the pauses in order', () => {
  const clock = buildStubClock(1000);

  clock.sleep(10);
  clock.sleep(25);

  expect(clock.now()).toBe(1035);
  expect(clock.sleeps).toStrictEqual([10, 25]);
});
