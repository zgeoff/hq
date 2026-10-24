import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { overrideBuild } from '../../test/override-build.ts';
import { overrideEnv } from '../config/override-env.ts';
import { quietWindow } from './quiet-window.ts';

test('it honours HQ_QUIET in a run from source', () => {
  onTestFinished(overrideEnv('HQ_QUIET', '10-12'));
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));

  expect(quietWindow()).toStrictEqual({ start: 10, end: 12 });
});

test('it keeps the default window in the installed hq, whatever HQ_QUIET says', () => {
  onTestFinished(overrideBuild({ commit: 'abc1234', dirty: false }));
  onTestFinished(overrideEnv('HQ_QUIET', '10-12'));
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));

  expect(quietWindow()).toStrictEqual({ start: 3, end: 7 });
});

test('it ignores a malformed HQ_QUIET in the installed hq', () => {
  onTestFinished(overrideBuild({ commit: 'abc1234', dirty: false }));
  onTestFinished(overrideEnv('HQ_QUIET', 'teapot'));
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));

  expect(quietWindow()).toStrictEqual({ start: 3, end: 7 });
});
