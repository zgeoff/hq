import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNodeBriefFiles } from './build-node-brief-files.ts';
import { requireGoalFileTarget } from './require-goal-file-target.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-brief-goal-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return { root };
}

test('it accepts a new file in an existing directory, and an existing regular file', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'old.md'), 'old');

  expect(() => requireGoalFileTarget(buildNodeBriefFiles(), join(ctx.root, 'new.md'))).not.toThrow();
  expect(() => requireGoalFileTarget(buildNodeBriefFiles(), join(ctx.root, 'old.md'))).not.toThrow();
});

test('it rejects a path whose directory does not exist', () => {
  const ctx = setupTest();

  expect(() => requireGoalFileTarget(buildNodeBriefFiles(), join(ctx.root, 'gone/kettle.md'))).toThrow(`--goal-file needs an existing directory: ${join(ctx.root, 'gone')}`);
});

test('it rejects a directory and a link, which hq would not overwrite', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.root, 'dir'));
  writeFileSync(join(ctx.root, 'real.md'), 'real');
  symlinkSync(join(ctx.root, 'real.md'), join(ctx.root, 'link.md'));

  expect(() => requireGoalFileTarget(buildNodeBriefFiles(), join(ctx.root, 'dir'))).toThrow('--goal-file would overwrite something that is not a regular file');
  expect(() => requireGoalFileTarget(buildNodeBriefFiles(), join(ctx.root, 'link.md'))).toThrow('--goal-file would overwrite something that is not a regular file');
});
