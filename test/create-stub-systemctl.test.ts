import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubSystemctl } from './create-stub-systemctl.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-stub-systemctl-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return { directory };
}

test('it logs each call and exits 0', () => {
  const ctx = setupTest();
  const stub = createStubSystemctl({ directory: ctx.directory, show: {} });

  const reloaded = Bun.spawnSync([join(stub.bin, 'systemctl'), '--user', 'daemon-reload']);
  const restarted = Bun.spawnSync([join(stub.bin, 'systemctl'), '--user', 'restart', 'kettle.service']);

  expect(reloaded.exitCode).toBe(0);
  expect(restarted.exitCode).toBe(0);
  expect(stub.readCalls()).toStrictEqual([
    ['--user', 'daemon-reload'],
    ['--user', 'restart', 'kettle.service'],
  ]);
});

test('it answers show with the value given for the property, like --value', () => {
  const ctx = setupTest();
  const stub = createStubSystemctl({ directory: ctx.directory, show: { Environment: 'PATH=/usr/bin HQ_LIVE=1' } });

  const shown = Bun.spawnSync([join(stub.bin, 'systemctl'), '--user', 'show', '-p', 'Environment', '--value', 'kettle.service']);

  expect(shown.stdout.toString()).toBe('PATH=/usr/bin HQ_LIVE=1\n');
});

test('it answers show with an empty line for a property it was given no value for', () => {
  const ctx = setupTest();
  const stub = createStubSystemctl({ directory: ctx.directory, show: {} });

  const shown = Bun.spawnSync([join(stub.bin, 'systemctl'), '--user', 'show', '-p', 'Transient', '--value', 'kettle.service']);

  expect(shown.exitCode).toBe(0);
  expect(shown.stdout.toString()).toBe('\n');
});

test('it is the systemctl a shell finds when its directory leads PATH', () => {
  const ctx = setupTest();
  const stub = createStubSystemctl({ directory: ctx.directory, show: {} });

  const found = Bun.spawnSync(['sh', '-c', 'command -v systemctl'], { env: { PATH: `${stub.bin}:/usr/bin:/bin` } });

  expect(found.stdout.toString()).toBe(`${join(stub.bin, 'systemctl')}\n`);
});
