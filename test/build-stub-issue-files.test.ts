import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
