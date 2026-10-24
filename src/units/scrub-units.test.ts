import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Runner } from '../runner/types.ts';
import { scrubUnits } from './scrub-units.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-scrub-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const calls: string[][] = [];
  const run: Runner = (cmd) => {
    calls.push(cmd);
    return Promise.resolve({ code: 0, stdout: '', stderr: '' });
  };
  return { directory, calls, run };
}

const DIRTY = '[Service]\nEnvironment=PATH=/usr/bin\nEnvironment="HQ_NOW=2031-03-04T05:06:07Z"\nEnvironment="HQ_LIVE=1"\nEnvironment="HQ_QUIET=10-12"\nExecStart=/bin/hq fleet ensure\n';
const CLEAN = '[Service]\nEnvironment=PATH=/usr/bin\nEnvironment="HQ_LIVE=1"\nExecStart=/bin/hq fleet ensure\n';

test('it removes only the clock lines from a unit and reloads systemd', async () => {
  const ctx = setupTest();
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));
  writeFileSync(join(ctx.directory, 'hq-fleet.service'), DIRTY);

  const changed = await scrubUnits(ctx.run, { directory: ctx.directory });

  expect(changed).toStrictEqual(['hq-fleet.service']);
  expect(readFileSync(join(ctx.directory, 'hq-fleet.service'), 'utf8')).toBe(CLEAN);
  expect(ctx.calls).toStrictEqual([['systemctl', '--user', 'daemon-reload']]);
});

test('it scrubs the lanes, fleet, backup and probe services', async () => {
  const ctx = setupTest();
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));
  for (const unit of ['hq-lanes', 'hq-fleet', 'hq-backup', 'hq-probe']) {
    writeFileSync(join(ctx.directory, `${unit}.service`), DIRTY);
  }

  const changed = await scrubUnits(ctx.run, { directory: ctx.directory });

  expect(changed).toStrictEqual(['hq-lanes.service', 'hq-fleet.service', 'hq-backup.service', 'hq-probe.service']);
});

test('it leaves a clean unit untouched and does not reload', async () => {
  const ctx = setupTest();
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));
  writeFileSync(join(ctx.directory, 'hq-lanes.service'), CLEAN);

  const changed = await scrubUnits(ctx.run, { directory: ctx.directory });

  expect(changed).toStrictEqual([]);
  expect(readFileSync(join(ctx.directory, 'hq-lanes.service'), 'utf8')).toBe(CLEAN);
  expect(ctx.calls).toStrictEqual([]);
});

test('it does nothing when the unit directory is missing', async () => {
  const ctx = setupTest();
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));

  const changed = await scrubUnits(ctx.run, { directory: join(ctx.directory, 'absent') });

  expect(changed).toStrictEqual([]);
  expect(ctx.calls).toStrictEqual([]);
});

test('it leaves other files in the unit directory alone', async () => {
  const ctx = setupTest();
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));
  mkdirSync(ctx.directory, { recursive: true });
  writeFileSync(join(ctx.directory, 'teapot.service'), DIRTY);

  const changed = await scrubUnits(ctx.run, { directory: ctx.directory });

  expect(changed).toStrictEqual([]);
  expect(readFileSync(join(ctx.directory, 'teapot.service'), 'utf8')).toBe(DIRTY);
});

test('it reports a failed reload', async () => {
  const ctx = setupTest();
  onTestFinished(() => setSystemTime());
  setSystemTime(new Date('2026-10-14T01:00:00Z'));
  writeFileSync(join(ctx.directory, 'hq-probe.service'), DIRTY);
  const failing: Runner = () => Promise.resolve({ code: 1, stdout: '', stderr: 'no bus' });

  const scrubbed = scrubUnits(failing, { directory: ctx.directory });

  await expect(scrubbed).rejects.toMatchObject({ code: 'systemctl_failed', message: expect.stringContaining('no bus') });
});
