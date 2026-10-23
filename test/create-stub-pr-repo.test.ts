import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realRunner } from '../src/runner/real-runner.ts';
import { createStubPRRepo } from './create-stub-pr-repo.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-stub-pr-repo-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return { root };
}

test('it serves the PR head and main from the GitHub URL of the repo', async () => {
  const ctx = setupTest();
  const stub = await createStubPRRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'AGENTS.md': 'Boil.\n' }], change: { 'AGENTS.md': 'Steam.\n' } });
  const other = join(ctx.root, 'other');

  await realRunner(['git', 'init', '-q', other]);
  await realRunner(['git', 'config', `url.${join(ctx.root, 'remotes', 'widgets.git')}.insteadOf`, 'https://github.com/zgeoff/widgets.git'], { cwd: other });
  const fetched = await realRunner(['git', 'fetch', '-q', 'https://github.com/zgeoff/widgets.git', '+pull/7/head:refs/hq/pr/7'], { cwd: other });
  const read = await realRunner(['git', 'rev-parse', 'refs/hq/pr/7'], { cwd: other });

  expect(fetched.code).toBe(0);
  expect(read.stdout.trim()).toBe(stub.head);
});

test('it leaves main one commit ahead of the PR base when asked', async () => {
  const ctx = setupTest();
  const stub = await createStubPRRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'AGENTS.md': 'Boil.\n' }], change: { 'AGENTS.md': 'Steam.\n' }, baseAfter: { 'README.md': 'Hello.\n' } });

  const parent = await realRunner(['git', 'rev-parse', 'refs/heads/main~1'], { cwd: stub.directory });

  expect(stub.baseHead).not.toBe(parent.stdout.trim());
  expect(parent.code).toBe(0);
});
