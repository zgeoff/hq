import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { buildUnitSettings } from './build-unit-settings.ts';

test('it drops the clock overrides and keeps the other HQ_* settings', () => {
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));

  const settings = buildUnitSettings('fleet', { HQ_NOW: '2031-03-04T05:06:07Z', HQ_QUIET: '10-12', HQ_LIVE: '1', HQ_DB: '/srv/kettle/state.db' });

  expect(settings).toBe('Environment="HQ_DB=/srv/kettle/state.db"\nEnvironment="HQ_LIVE=1"\n');
});
