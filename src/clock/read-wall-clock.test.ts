import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { overrideEnv } from '../config/override-env.ts';
import { readWallClock } from './read-wall-clock.ts';

test('it reads the wall clock while HQ_NOW pins a future time', () => {
  onTestFinished(overrideEnv('HQ_NOW', '2099-01-01T00:00:00Z'));
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));

  expect(readWallClock()).toStrictEqual(new Date('2026-10-14T01:00:00Z'));
});
