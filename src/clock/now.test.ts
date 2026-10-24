import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { overrideEnv } from '../config/override-env.ts';
import { now } from './now.ts';

function setupTest() {
  return {
    installBuild: () => {
      const saved = globalThis.HQ_BUILD;
      globalThis.HQ_BUILD = { commit: 'abc1234', dirty: false };
      onTestFinished(() => {
        globalThis.HQ_BUILD = saved;
      });
    },
  };
}

test('it honours HQ_NOW in a run from source', () => {
  onTestFinished(overrideEnv('HQ_NOW', '2031-03-04T05:06:07Z'));
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));

  expect(now()).toStrictEqual(new Date('2031-03-04T05:06:07Z'));
});

test('it reads the real clock in the installed hq, whatever HQ_NOW says', () => {
  const ctx = setupTest();
  ctx.installBuild();
  onTestFinished(overrideEnv('HQ_NOW', '2031-03-04T05:06:07Z'));
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));

  expect(now()).toStrictEqual(new Date('2026-10-14T01:00:00Z'));
});
