import { expect, mock, onTestFinished, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunResult, Runner } from '../runner/types.ts';
import { removeTimer } from './remove-timer.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-remove-timer-'));

  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));

  return { directory };
}

test('it disables the timer, deletes both unit files, and reloads', async () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'hq-kettle.service'), '[Service]\n');
  writeFileSync(join(ctx.directory, 'hq-kettle.timer'), '[Timer]\n');
  const run = mock<Runner>(() => Promise.resolve({ code: 0, stdout: '', stderr: '' }));

  await removeTimer(run, { directory: ctx.directory, unit: 'hq-kettle' });

  expect(run.mock.calls.map((call) => call[0])).toStrictEqual([
    ['systemctl', '--user', 'disable', '--now', 'hq-kettle.timer'],
    ['systemctl', '--user', 'daemon-reload'],
  ]);
  expect(existsSync(join(ctx.directory, 'hq-kettle.service'))).toBe(false);
  expect(existsSync(join(ctx.directory, 'hq-kettle.timer'))).toBe(false);
});

test('it refuses and keeps the unit files when the disable fails', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'hq-kettle.timer'), '[Timer]\n');

  const removed = removeTimer(() => Promise.resolve({ code: 1, stdout: '', stderr: 'Failed to disable unit: Access denied' }), { directory: ctx.directory, unit: 'hq-kettle' });

  expect(removed).rejects.toMatchObject({ code: 'timer_failed', message: expect.stringContaining('Access denied') });
  expect(existsSync(join(ctx.directory, 'hq-kettle.timer'))).toBe(true);
});

test('it treats a timer that is not installed as already off', () => {
  const ctx = setupTest();
  const answers: Record<string, RunResult> = {
    'systemctl --user disable --now hq-kettle.timer': { code: 1, stdout: '', stderr: 'Failed to disable unit: Unit hq-kettle.timer does not exist' },
    'systemctl --user daemon-reload': { code: 0, stdout: '', stderr: '' },
  };

  expect(removeTimer((cmd) => Promise.resolve(answers[cmd.join(' ')] ?? { code: 0, stdout: '', stderr: '' }), { directory: ctx.directory, unit: 'hq-kettle' })).resolves.toBeUndefined();
});

test('it refuses when the reload fails', () => {
  const ctx = setupTest();
  const answers: Record<string, RunResult> = {
    'systemctl --user disable --now hq-kettle.timer': { code: 0, stdout: '', stderr: '' },
    'systemctl --user daemon-reload': { code: 1, stdout: '', stderr: 'Failed to reload daemon: invented' },
  };

  expect(removeTimer((cmd) => Promise.resolve(answers[cmd.join(' ')] ?? { code: 0, stdout: '', stderr: '' }), { directory: ctx.directory, unit: 'hq-kettle' })).rejects.toMatchObject({ code: 'timer_failed' });
});
