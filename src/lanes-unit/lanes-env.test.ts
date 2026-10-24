import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { lanesEnv } from './lanes-env.ts';

test('it drops the clock overrides and keeps the other HQ_* settings', () => {
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));

  const env = lanesEnv('/home/kettle', { HQ_NOW: '2031-03-04T05:06:07Z', HQ_QUIET: '10-12', HQ_LIVE: '1', HQ_AS: 'z-teapot' });

  expect(env).toStrictEqual({ PATH: '/home/kettle/.local/bin:/home/kettle/.bun/bin:/usr/local/bin:/usr/bin:/bin', HQ_LIVE: '1', HQ_AS: 'hq-lanes' });
});
