import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLocalSetting } from './read-local-setting.ts';
import { readLocalSettings } from './read-local-settings.ts';

// A temporary folder for the local file; each test writes its own file there.
function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hq-local-config-')),
    file = join(dir, 'local.json');
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, file };
}

test('a key that only the file has is read from the file', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, JSON.stringify({ HQ_PROBE_TARGET: 'https://kettle.invalid/live' }));

  expect(readLocalSetting('HQ_PROBE_TARGET', { HQ_LOCAL_CONFIG: ctx.file })).toBe('https://kettle.invalid/live');
});

test('a variable set in the environment wins over the file', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, JSON.stringify({ HQ_PROBE_TARGET: 'https://kettle.invalid/live' }));

  expect(readLocalSetting('HQ_PROBE_TARGET', { HQ_LOCAL_CONFIG: ctx.file, HQ_PROBE_TARGET: 'https://teapot.invalid/live' })).toBe('https://teapot.invalid/live');
});

test('a key the file lacks refuses with bad_config naming the key and the file', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, JSON.stringify({ HQ_PROBE_READY: 'https://kettle.invalid/ready' }));

  expect(() => readLocalSetting('HQ_PROBE_TARGET', { HQ_LOCAL_CONFIG: ctx.file })).toThrow(expect.objectContaining({ code: 'bad_config', message: `HQ_PROBE_TARGET is not set: put it in ${ctx.file} or the environment` }));
});

test('a missing file gives no values and refuses with bad_config', () => {
  const ctx = setupTest();

  expect(() => readLocalSetting('HQ_PROBE_TARGET', { HQ_LOCAL_CONFIG: ctx.file })).toThrow(expect.objectContaining({ code: 'bad_config', message: expect.stringContaining(ctx.file) }));
});

test('the reader keeps only the local keys and drops any other', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, JSON.stringify({ HQ_DB: '/nowhere/kettle.db', HQ_PROBE_READY: 'https://kettle.invalid/ready' }));

  expect(readLocalSettings({ HQ_LOCAL_CONFIG: ctx.file })).toStrictEqual({ HQ_PROBE_READY: 'https://kettle.invalid/ready' });
});

test('a file that cannot be inspected refuses with bad_config naming the cause', () => {
  const ctx = setupTest();
  symlinkSync(ctx.file, ctx.file);

  expect(() => readLocalSettings({ HQ_LOCAL_CONFIG: ctx.file })).toThrow(expect.objectContaining({ code: 'bad_config', message: expect.stringContaining('ELOOP') }));
});

test.each([
  ['not JSON', '{ kettle'],
  ['an array', '["kettle"]'],
  ['a non-string value', JSON.stringify({ HQ_PROBE_TARGET: 3 })],
  ['a nested object', JSON.stringify({ HQ_PROBE_TARGET: { url: 'x' } })],
])('a file that is %s refuses with bad_config naming the file', (_label, contents) => {
  const ctx = setupTest();
  writeFileSync(ctx.file, contents);

  expect(() => readLocalSetting('HQ_PROBE_TARGET', { HQ_LOCAL_CONFIG: ctx.file })).toThrow(expect.objectContaining({ code: 'bad_config', message: expect.stringContaining(ctx.file) }));
});

test('a changed file is read again', () => {
  const ctx = setupTest();
  writeFileSync(ctx.file, JSON.stringify({ HQ_PROBE_TARGET: 'https://kettle.invalid/live' }));
  expect(readLocalSetting('HQ_PROBE_TARGET', { HQ_LOCAL_CONFIG: ctx.file })).toBe('https://kettle.invalid/live');

  writeFileSync(ctx.file, JSON.stringify({ HQ_PROBE_TARGET: 'https://teapot.invalid/live' }));
  utimesSync(ctx.file, new Date(Date.now() + 5000), new Date(Date.now() + 5000));

  expect(readLocalSetting('HQ_PROBE_TARGET', { HQ_LOCAL_CONFIG: ctx.file })).toBe('https://teapot.invalid/live');
});
