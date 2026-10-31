import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNodeBriefFiles } from './build-node-brief-files.ts';
import { runBriefCheckCommand } from './run-brief-check-command.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-brief-check-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return { root };
}

test('it passes a brief under the limit with its byte count', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'brief.txt'), '/goal A kettle that boils.');

  expect(runBriefCheckCommand(buildNodeBriefFiles(), join(ctx.root, 'brief.txt'))).toStrictEqual({ data: { bytes: 26, limit: 4000 }, text: 'ok: 26 bytes' });
});

test('it passes a brief of exactly 4000 bytes', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'brief.txt'), 'k'.repeat(4000));

  expect(runBriefCheckCommand(buildNodeBriefFiles(), join(ctx.root, 'brief.txt'))).toStrictEqual({ data: { bytes: 4000, limit: 4000 }, text: 'ok: 4000 bytes' });
});

test('it passes a 4000-byte brief saved with one trailing newline, as hq brief > file writes it', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'brief.txt'), `${'k'.repeat(4000)}\n`);

  expect(runBriefCheckCommand(buildNodeBriefFiles(), join(ctx.root, 'brief.txt'))).toStrictEqual({ data: { bytes: 4000, limit: 4000 }, text: 'ok: 4000 bytes' });
});

test('it refuses a brief of 4001 bytes with its byte count', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'brief.txt'), 'k'.repeat(4001));

  expect(() => runBriefCheckCommand(buildNodeBriefFiles(), join(ctx.root, 'brief.txt'))).toThrow(expect.objectContaining({ code: 'too_long', message: 'the brief is 4001 bytes, over the 4000 limit', data: { bytes: 4001, limit: 4000 } }));
});

test('it counts a multibyte character in bytes, so 2000 of them make 4000', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'brief.txt'), 'é'.repeat(2000));

  expect(runBriefCheckCommand(buildNodeBriefFiles(), join(ctx.root, 'brief.txt')).data).toStrictEqual({ bytes: 4000, limit: 4000 });
});

test('it refuses one multibyte character past the limit, though it holds fewer than 4000 characters', () => {
  const ctx = setupTest();
  writeFileSync(join(ctx.root, 'brief.txt'), `${'k'.repeat(3999)}é`);

  expect(() => runBriefCheckCommand(buildNodeBriefFiles(), join(ctx.root, 'brief.txt'))).toThrow(expect.objectContaining({ code: 'too_long', message: 'the brief is 4001 bytes, over the 4000 limit' }));
});

test('it refuses a missing file', () => {
  const ctx = setupTest();

  expect(() => runBriefCheckCommand(buildNodeBriefFiles(), join(ctx.root, 'gone.txt'))).toThrow(expect.objectContaining({ code: 'not_found', message: `no file at ${join(ctx.root, 'gone.txt')}` }));
});

test('it refuses a directory', () => {
  const ctx = setupTest();
  mkdirSync(join(ctx.root, 'shelf'));

  expect(() => runBriefCheckCommand(buildNodeBriefFiles(), join(ctx.root, 'shelf'))).toThrow(expect.objectContaining({ code: 'bad_args', message: `${join(ctx.root, 'shelf')} is not a regular file` }));
});

test('it refuses a call with no file', () => {
  expect(() => runBriefCheckCommand(buildNodeBriefFiles(), undefined)).toThrow(expect.objectContaining({ code: 'bad_args', message: 'hq brief check <file> needs the file that holds the brief' }));
});
