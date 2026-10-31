import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readChangingFile } from './read-changing-file.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-changing-reader-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return { directory };
}

test('it reads the file as it is before the chosen read', () => {
  const ctx = setupTest();
  const file = join(ctx.directory, 'kettle.md');
  writeFileSync(file, 'boiled\n');
  const read = readChangingFile(file, 'poured\n', 2);

  expect(read(file)).toBe('boiled\n');
});

test('it overwrites the file on the chosen read and returns the new text', () => {
  const ctx = setupTest();
  const file = join(ctx.directory, 'kettle.md');
  writeFileSync(file, 'boiled\n');
  const read = readChangingFile(file, 'poured\n', 2);
  read(file);

  expect(read(file)).toBe('poured\n');
});

test('it changes the file only once', () => {
  const ctx = setupTest();
  const file = join(ctx.directory, 'kettle.md');
  writeFileSync(file, 'boiled\n');
  const read = readChangingFile(file, 'poured\n', 1);
  read(file);
  writeFileSync(file, 'washed\n');

  expect(read(file)).toBe('washed\n');
});

test('it does not count a read of another file', () => {
  const ctx = setupTest();
  const file = join(ctx.directory, 'kettle.md');
  const other = join(ctx.directory, 'notes.md');
  writeFileSync(file, 'boiled\n');
  writeFileSync(other, 'cup\n');
  const read = readChangingFile(file, 'poured\n', 1);

  expect([read(other), read(file)]).toStrictEqual(['cup\n', 'poured\n']);
});
