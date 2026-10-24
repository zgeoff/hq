import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Runner } from '../runner/types.ts';
import { runUnitsCommand } from './run-units-command.ts';

function setupTest() {
  const home = mkdtempSync(join(tmpdir(), 'hq-units-'));
  onTestFinished(() => rmSync(home, { recursive: true, force: true }));
  const directory = join(home, '.config', 'systemd', 'user');
  mkdirSync(directory, { recursive: true });
  const calls: string[][] = [];
  const run: Runner = (cmd) => {
    calls.push(cmd);
    return Promise.resolve({ code: 0, stdout: '', stderr: '' });
  };
  return { home, directory, calls, run };
}

test('it reports the units it scrubbed and reloads systemd', async () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'hq-fleet.service'), '[Service]\nEnvironment="HQ_NOW=2031-03-04T05:06:07Z"\nEnvironment="HQ_LIVE=1"\n');

  const out = await runUnitsCommand({ verb: 'scrub', run: ctx.run, home: ctx.home, env: { PATH: '/usr/bin' } });

  expect(out.data).toStrictEqual({ changed: ['hq-fleet.service'] });
  expect(out.text).toBe('Removed HQ_NOW and HQ_QUIET from hq-fleet.service; systemd reloaded.');
  expect(readFileSync(join(ctx.directory, 'hq-fleet.service'), 'utf8')).toBe('[Service]\nEnvironment="HQ_LIVE=1"\n');
  expect(ctx.calls).toStrictEqual([['systemctl', '--user', 'daemon-reload']]);
});

test('it says no unit needed scrubbing when every unit is clean', async () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'hq-lanes.service'), '[Service]\nEnvironment="HQ_LIVE=1"\n');

  const out = await runUnitsCommand({ verb: 'scrub', run: ctx.run, home: ctx.home, env: { PATH: '/usr/bin' } });

  expect(out.data).toStrictEqual({ changed: [] });
  expect(out.text).toBe('No unit sets HQ_NOW or HQ_QUIET.');
  expect(ctx.calls).toStrictEqual([]);
});

test('it rejects an unknown verb with bad_args', async () => {
  const ctx = setupTest();

  const refused = runUnitsCommand({ verb: 'bogus', run: ctx.run, home: ctx.home, env: { PATH: '/usr/bin' } });

  await expect(refused).rejects.toMatchObject({ code: 'bad_args', message: 'unknown command: hq units bogus' });
});

test('it rejects a bare hq units with bad_args', async () => {
  const ctx = setupTest();

  const refused = runUnitsCommand({ verb: undefined, run: ctx.run, home: ctx.home, env: { PATH: '/usr/bin' } });

  await expect(refused).rejects.toMatchObject({ code: 'bad_args', message: 'unknown command: hq units' });
});
