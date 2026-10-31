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

test('it accepts a new file in an existing directory', () => {
  const ctx = setupTest();

  expect(() => requireGoalFileTarget(buildNodeBriefFiles(), join(ctx.root, 'new.md'))).not.toThrow();
});

test('it accepts an existing regular file, which it will replace', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'old.md'), 'old');

  expect(() => requireGoalFileTarget(buildNodeBriefFiles(), join(ctx.root, 'old.md'))).not.toThrow();
});

test('it accepts a path that climbs out of an existing directory to one that exists, since the launcher names the path', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.root, 'shelf'));

  expect(() => requireGoalFileTarget(buildNodeBriefFiles(), `${ctx.root}/shelf/../goal.md`)).not.toThrow();
});

test('it rejects a path whose directory does not exist', () => {
  const ctx = setupTest();

  expect(() => requireGoalFileTarget(buildNodeBriefFiles(), join(ctx.root, 'gone/kettle.md'))).toThrow(`--goal-file needs an existing directory: ${join(ctx.root, 'gone')}`);
});

test('it rejects a path that climbs through a directory that does not exist', () => {
  const ctx = setupTest();

  expect(() => requireGoalFileTarget(buildNodeBriefFiles(), `${ctx.root}/gone/../goal.md`)).toThrow(`--goal-file needs an existing directory: ${ctx.root}/gone/..`);
});

test('it rejects a path whose directory is a file', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'kettle.md'), 'boil');

  expect(() => requireGoalFileTarget(buildNodeBriefFiles(), join(ctx.root, 'kettle.md/goal.md'))).toThrow(`--goal-file needs an existing directory: ${join(ctx.root, 'kettle.md')}`);
});

test('it rejects a directory, which hq would not overwrite', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.root, 'shelf'));

  expect(() => requireGoalFileTarget(buildNodeBriefFiles(), join(ctx.root, 'shelf'))).toThrow(`--goal-file would overwrite something that is not a regular file: ${join(ctx.root, 'shelf')}`);
});

test('it rejects a link to a regular file, which hq would write through', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'real.md'), 'real');
  symlinkSync(join(ctx.root, 'real.md'), join(ctx.root, 'link.md'));

  expect(() => requireGoalFileTarget(buildNodeBriefFiles(), join(ctx.root, 'link.md'))).toThrow(`--goal-file would overwrite something that is not a regular file: ${join(ctx.root, 'link.md')}`);
});

test('it rejects a link to nothing, which hq would write through', () => {
  const ctx = setupTest();
  symlinkSync(join(ctx.root, 'gone.md'), join(ctx.root, 'dangling.md'));

  expect(() => requireGoalFileTarget(buildNodeBriefFiles(), join(ctx.root, 'dangling.md'))).toThrow(`--goal-file would overwrite something that is not a regular file: ${join(ctx.root, 'dangling.md')}`);
});
