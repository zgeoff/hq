import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { overrideBuild } from '../../test/override-build.ts';
import { overrideEnv } from '../config/override-env.ts';
import { now } from './now.ts';

test('it honours HQ_NOW in a run from source', () => {
  onTestFinished(overrideEnv('HQ_NOW', '2031-03-04T05:06:07Z'));
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));

  expect(now()).toStrictEqual(new Date('2031-03-04T05:06:07Z'));
});

test('it reads the real clock in the installed hq, whatever HQ_NOW says', () => {
  onTestFinished(overrideBuild({ commit: 'abc1234', dirty: false }));
  onTestFinished(overrideEnv('HQ_NOW', '2031-03-04T05:06:07Z'));
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));

  expect(now()).toStrictEqual(new Date('2026-10-14T01:00:00Z'));
});
