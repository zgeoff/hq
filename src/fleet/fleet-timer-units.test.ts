import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { fleetTimerUnits } from './fleet-timer-units.ts';

test("it carries the installing shell's HQ_* settings into the fleet service", () => {
  const units = fleetTimerUnits('/opt/kettle/bun /opt/kettle/src/cli.ts', {
    HOME: '/home/kettle',
    HQ_LIVE: '1',
    HQ_DB: '/srv/kettle/state.db',
    HQ_PRIVATE_DIR: '/srv/kettle/private',
    HQ_AS: 'z-teapot',
    OTHER: 'dropped',
  });

  expect(units.service).toBe(
    '[Unit]\nDescription=hq fleet ensure: respawn missing z- sessions\n\n[Service]\nType=oneshot\nEnvironment=PATH=/home/kettle/.local/bin:/usr/local/bin:/usr/bin:/bin\nEnvironment=HQ_AS=hq-fleet\n' +
      'Environment="HQ_DB=/srv/kettle/state.db"\nEnvironment="HQ_LIVE=1"\nEnvironment="HQ_PRIVATE_DIR=/srv/kettle/private"\nExecStart=/opt/kettle/bun /opt/kettle/src/cli.ts fleet ensure\n',
  );
});

test('it makes a relative HQ_DB absolute against the installing directory', () => {
  const units = fleetTimerUnits('/bin/hq', { HOME: '/home/kettle', HQ_DB: 'kettle/state.db' });

  expect(units.service).toInclude(`Environment="HQ_DB=${join(process.cwd(), 'kettle', 'state.db')}"\n`);
});

test('it refuses a setting with a quote, naming it', () => {
  expect(() => fleetTimerUnits('/bin/hq', { HOME: '/home/kettle', HQ_OWNER: 'tea"pot' })).toThrow(expect.objectContaining({ code: 'bad_config', message: expect.stringContaining('HQ_OWNER') }));
});

test('it carries XDG_CONFIG_HOME, which locates the local settings file, into the fleet service', () => {
  const units = fleetTimerUnits('/bin/hq', { HOME: '/home/kettle', XDG_CONFIG_HOME: '/srv/kettle/config' });

  expect(units.service).toInclude('Environment="XDG_CONFIG_HOME=/srv/kettle/config"\nExecStart=/bin/hq fleet ensure\n');
});
