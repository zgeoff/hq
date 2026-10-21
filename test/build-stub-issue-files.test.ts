import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubIssueFiles } from './build-stub-issue-files.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-stub-issue-files-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return { directory };
}

test('it writes every other file in full', () => {
  const ctx = setupTest();
  const files = buildStubIssueFiles('issues-2.json');

  files.writeFileSync(join(ctx.directory, 'issues-1.json'), '{"issues":["oolong"]}');

  expect(readFileSync(join(ctx.directory, 'issues-1.json'), 'utf8')).toBe('{"issues":["oolong"]}');
});

test('it writes half of the failing page, then throws', () => {
  const ctx = setupTest();
  const files = buildStubIssueFiles('issues-2.json');
  const path = join(ctx.directory, 'issues-2.json');

  expect(() => files.writeFileSync(path, '{"issues":[1]}')).toThrow(`ENOSPC: no space left on device, write '${path}'`);
  expect(readFileSync(path, 'utf8')).toBe('{"issue');
});

test('it throws on removing the stuck page and leaves it in place', () => {
  const ctx = setupTest();
  const files = buildStubIssueFiles('issues-3.json', 'issues-1.json');
  const path = join(ctx.directory, 'issues-1.json');
  writeFileSync(path, '{"issues":["sencha"]}');

  expect(() => files.rmSync(path, { force: true })).toThrow(`EIO: i/o error, unlink '${path}'`);
  expect(existsSync(path)).toBe(true);
});

test('it removes every other page', () => {
  const ctx = setupTest();
  const files = buildStubIssueFiles('issues-3.json', 'issues-1.json');
  const path = join(ctx.directory, 'issues-2.json');
  writeFileSync(path, '{"issues":["sencha"]}');

  files.rmSync(path, { force: true });

  expect(existsSync(path)).toBe(false);
});
