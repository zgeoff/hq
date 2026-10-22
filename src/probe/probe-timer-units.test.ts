import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildProbeTimerUnits } from './probe-timer-units.ts';

test('the timer units run hq probe run every minute', () => {
  const units = buildProbeTimerUnits('/bin/hq', { HOME: '/home/kettle' });
  expect(units.service).toContain('ExecStart=/bin/hq probe run');
  expect(units.service).toContain('HQ_AS=hq-probe');
  expect(units.timer).toContain('OnUnitActiveSec=1min');
  expect(units.timer).toContain('AccuracySec=5s');
});

test('the service carries the local file path and probe URLs that the installing shell sets', () => {
  const units = buildProbeTimerUnits('/bin/hq', { HOME: '/home/kettle', HQ_LOCAL_CONFIG: '/home/kettle/hq.json', HQ_PROBE_TARGET: 'https://kettle.invalid/live?a=%41' });

  expect(units.service).toBe(
    "[Unit]\nDescription=hq probe: one check of Nix's /health/live and /health/ready\n\n[Service]\nType=oneshot\nEnvironment=PATH=/home/kettle/.local/bin:/usr/local/bin:/usr/bin:/bin\nEnvironment=HQ_AS=hq-probe\n" +
      'Environment="HQ_LOCAL_CONFIG=/home/kettle/hq.json"\nEnvironment="HQ_PROBE_TARGET=https://kettle.invalid/live?a=%%41"\nExecStart=/bin/hq probe run\n',
  );
});

test('a probe setting with a quote refuses with bad_config naming it', () => {
  expect(() => buildProbeTimerUnits('/bin/hq', { HOME: '/home/kettle', HQ_PROBE_READY: 'https://kettle.invalid/"ready' })).toThrow(expect.objectContaining({ code: 'bad_config', message: expect.stringContaining('HQ_PROBE_READY') }));
});

test('it carries the selected database into the probe service as an absolute path', () => {
  const units = buildProbeTimerUnits('/bin/hq', { HOME: '/home/kettle', HQ_DB: 'kettle/state.db', HQ_AS: 'z-teapot' });

  expect(units.service).toBe(
    "[Unit]\nDescription=hq probe: one check of Nix's /health/live and /health/ready\n\n[Service]\nType=oneshot\nEnvironment=PATH=/home/kettle/.local/bin:/usr/local/bin:/usr/bin:/bin\nEnvironment=HQ_AS=hq-probe\n" +
      `Environment="HQ_DB=${join(process.cwd(), 'kettle', 'state.db')}"\nExecStart=/bin/hq probe run\n`,
  );
});

test('it carries the local settings file into the probe service as an absolute path', () => {
  const units = buildProbeTimerUnits('/bin/hq', { HOME: '/home/kettle', HQ_LOCAL_CONFIG: './kettle/local.json' });

  expect(units.service).toInclude(`Environment="HQ_LOCAL_CONFIG=${join(process.cwd(), 'kettle', 'local.json')}"\n`);
});

test.each([
  ['HQ_PRIVATE_DIR', './kettle/private', join(process.cwd(), 'kettle', 'private')],
  ['HQ_CLAUDE_JSON', 'kettle/claude.json', join(process.cwd(), 'kettle', 'claude.json')],
  ['HQ_BACKUP_DIRS', 'kettle/one:/srv/two', `${join(process.cwd(), 'kettle', 'one')}:/srv/two`],
  ['HQ_PROBE_CONTROL', 'https://kettle.invalid/zen', 'https://kettle.invalid/zen'],
])('it writes %s into the probe service resolved against the installing directory', (name, value, expected) => {
  const units = buildProbeTimerUnits('/bin/hq', { HOME: '/home/kettle', [name]: value });

  expect(units.service).toInclude(`Environment="${name}=${expected}"\n`);
});
