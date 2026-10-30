import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readStateSizeChecks } from './read-state-size-checks.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-state-size-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, roles: ['kettle', 'delivery'] };
}

test('#readStateSizeChecks a file over the default limit fails, naming the file, its size and the limit', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), 'x'.repeat(20_480));

  expect(readStateSizeChecks(ctx.directory, ctx.roles)).toStrictEqual([{ key: 'state-size:kettle.md', ok: false, line: 'state file kettle.md is 20.0 KB, over its 16 KB limit' }]);
});

test('#readStateSizeChecks delivery fails at 15 KB where another role passes', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'delivery.md'), 'x'.repeat(15_500));
  writeFileSync(join(ctx.directory, 'kettle.md'), 'x'.repeat(15_500));

  expect(readStateSizeChecks(ctx.directory, ctx.roles).map((check) => check.key)).toStrictEqual(['state-size:delivery.md']);
});

test('#readStateSizeChecks files under their limits make one passing line', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), 'x'.repeat(1000));
  writeFileSync(join(ctx.directory, 'delivery.md'), 'x'.repeat(1000));

  expect(readStateSizeChecks(ctx.directory, ctx.roles)).toStrictEqual([{ key: 'state-size', ok: true, line: 'state files: all 2 under their limits' }]);
});

test('#readStateSizeChecks a role with no file is skipped', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle.md'), 'x'.repeat(1000));

  expect(readStateSizeChecks(ctx.directory, ctx.roles)).toStrictEqual([{ key: 'state-size', ok: true, line: 'state files: all 1 under their limits' }]);
});

test('#readStateSizeChecks markdown files that are not a role state file are ignored', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.directory, 'kettle-archive-2026-10.md'), 'x'.repeat(50_000));
  writeFileSync(join(ctx.directory, 'release-archive.md'), 'x'.repeat(50_000));
  writeFileSync(join(ctx.directory, 'notes.md'), 'x'.repeat(50_000));

  expect(readStateSizeChecks(ctx.directory, ctx.roles).map((check) => check.ok)).toStrictEqual([true]);
});

test('#readStateSizeChecks a missing folder is a failing read, not a pass', () => {
  const ctx = setupTest();

  expect(readStateSizeChecks(join(ctx.directory, 'gone'), ctx.roles)).toStrictEqual([{ key: 'state-size', ok: false, line: `can't read the state files (${join(ctx.directory, 'gone')}: ENOENT)` }]);
});

test('#readStateSizeChecks a role state file that cannot be read is a failing read, not a pass', () => {
  const ctx = setupTest();
  symlinkSync('kettle.md', join(ctx.directory, 'kettle.md'));

  expect(readStateSizeChecks(ctx.directory, ctx.roles)).toStrictEqual([{ key: 'state-size', ok: false, line: `can't read the state files (${join(ctx.directory, 'kettle.md')}: ELOOP)` }]);
});
