import { expect, onTestFinished, test } from 'bun:test';
import { overrideEnv } from '../../config/override-env.ts';
import { readCapClock } from './read-cap-clock.ts';

test('it gives a cap set the wall clock while HQ_NOW pins a future time', () => {
  onTestFinished(overrideEnv('HQ_NOW', '2099-01-01T00:00:00Z'));
  const before = Date.now();

  const clock = readCapClock({ kind: 'set', cap: 100, until: null, reason: 'kettle descaling' });

  expect(clock.getTime()).toBeGreaterThanOrEqual(before);
  expect(clock.getTime()).toBeLessThanOrEqual(Date.now());
});

test('it gives a cap lift the wall clock while HQ_NOW pins a future time', () => {
  onTestFinished(overrideEnv('HQ_NOW', '2099-01-01T00:00:00Z'));
  const before = Date.now();

  const clock = readCapClock({ kind: 'off', reason: null });

  expect(clock.getTime()).toBeGreaterThanOrEqual(before);
  expect(clock.getTime()).toBeLessThanOrEqual(Date.now());
});

test('it gives a look at the cap the time HQ_NOW pins', () => {
  onTestFinished(overrideEnv('HQ_NOW', '2099-01-01T00:00:00Z'));

  expect(readCapClock({ kind: 'show' })).toStrictEqual(new Date('2099-01-01T00:00:00Z'));
});
