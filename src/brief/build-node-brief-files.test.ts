import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNodeBriefFiles } from './build-node-brief-files.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-brief-files-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return { root, files: buildNodeBriefFiles() };
}

test('it tells a file, a directory and a missing path apart', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'kettle.md'), 'boil');
  mkdirSync(join(ctx.root, 'shelf'));

  expect(ctx.files.readKind(join(ctx.root, 'kettle.md'))).toBe('file');
  expect(ctx.files.readKind(join(ctx.root, 'shelf'))).toBe('directory');
  expect(ctx.files.readKind(join(ctx.root, 'gone.md'))).toBe('missing');
});

test('it follows a link with readKind and reports the link with readLinkKind', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'kettle.md'), 'boil');
  symlinkSync(join(ctx.root, 'kettle.md'), join(ctx.root, 'link.md'));

  expect(ctx.files.readKind(join(ctx.root, 'link.md'))).toBe('file');
  expect(ctx.files.readLinkKind(join(ctx.root, 'link.md'))).toBe('link');
});

test('it reports a link to nothing as missing when followed', () => {
  const ctx = setupTest();
  symlinkSync(join(ctx.root, 'gone.md'), join(ctx.root, 'dangling.md'));

  expect(ctx.files.readKind(join(ctx.root, 'dangling.md'))).toBe('missing');
});

test('it writes text that readText gives back', () => {
  const ctx = setupTest();

  ctx.files.writeText(join(ctx.root, 'kettle.md'), 'boil é\n');

  expect(ctx.files.readText(join(ctx.root, 'kettle.md'))).toBe('boil é\n');
  expect(readFileSync(join(ctx.root, 'kettle.md'), 'utf8')).toBe('boil é\n');
});

test('it replaces an older, longer file whole', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'kettle.md'), 'older text that is longer than the new one will be');

  ctx.files.writeText(join(ctx.root, 'kettle.md'), 'boil\n');

  expect(readFileSync(join(ctx.root, 'kettle.md'), 'utf8')).toBe('boil\n');
});
