import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOptionalFile } from './read-optional-file.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-optional-file-'));

  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads the text of a file that exists', async () => {
  const ctx = setupTest();

  writeFileSync(join(ctx.directory, 'teapot.txt'), 'short and stout\n');

  expect(await readOptionalFile(join(ctx.directory, 'teapot.txt'))).toBe('short and stout\n');
});

test('it gives null for a file that does not exist', async () => {
  const ctx = setupTest();

  expect(await readOptionalFile(join(ctx.directory, 'missing.txt'))).toBeNull();
});
