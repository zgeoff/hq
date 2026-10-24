import { expect, onTestFinished, test } from 'bun:test';
import { overrideEnv } from '../config/override-env.ts';
import { readWallClock } from './read-wall-clock.ts';

test('it reads the wall clock while HQ_NOW pins a future time', () => {
  onTestFinished(overrideEnv('HQ_NOW', '2099-01-01T00:00:00Z'));
  const before = Date.now();

  const clock = readWallClock();

  expect(clock.getTime()).toBeGreaterThanOrEqual(before);
  expect(clock.getTime()).toBeLessThanOrEqual(Date.now());
});
