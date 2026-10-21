import { expect, test } from 'bun:test';
import { buildProbeTimerUnits } from './probe-timer-units.ts';

test('the timer units run hq probe run every minute', () => {
  const u = buildProbeTimerUnits('/bin/hq');
  expect(u.service).toContain('ExecStart=/bin/hq probe run');
  expect(u.service).toContain('HQ_AS=hq-probe');
  expect(u.timer).toContain('OnUnitActiveSec=1min');
  expect(u.timer).toContain('AccuracySec=5s');
});

test('the service carries the local file path and probe URLs that the installing shell sets', () => {
  const u = buildProbeTimerUnits('/bin/hq', { HOME: '/home/kettle', HQ_LOCAL_CONFIG: '/home/kettle/hq.json', HQ_PROBE_TARGET: 'https://kettle.invalid/live?a=%41' });

  expect(u.service).toBe(
    "[Unit]\nDescription=hq probe: one check of Nix's /health/live and /health/ready\n\n[Service]\nType=oneshot\nEnvironment=PATH=/home/kettle/.local/bin:/usr/local/bin:/usr/bin:/bin\nEnvironment=HQ_AS=hq-probe\n" +
      'Environment="HQ_LOCAL_CONFIG=/home/kettle/hq.json"\nEnvironment="HQ_PROBE_TARGET=https://kettle.invalid/live?a=%%41"\nExecStart=/bin/hq probe run\n',
  );
});

test('a probe setting with a quote refuses with bad_config naming it', () => {
  expect(() => buildProbeTimerUnits('/bin/hq', { HOME: '/home/kettle', HQ_PROBE_READY: 'https://kettle.invalid/"ready' })).toThrow(expect.objectContaining({ code: 'bad_config', message: expect.stringContaining('HQ_PROBE_READY') }));
});
