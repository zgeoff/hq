import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realRunner } from '../src/runner/real-runner.ts';
import { createStubRebaseRepo } from './create-stub-rebase-repo.ts';

function setupTest() {
  const root = mkdtempSync(join(tmpdir(), 'hq-stub-rebase-repo-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return { root };
}

test('it serves a rebased head that holds main and the PR change', async () => {
  const ctx = setupTest();
  const repo = await createStubRebaseRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'a.txt': 'one\n' }], change: { 'b.txt': 'two\n' } });

  await repo.moveMain({ 'c.txt': 'three\n' });
  const head = await repo.rebase();

  expect(head).not.toBe(repo.oldHead);
  const served = await repo.readServedHead();
  expect(served).toBe(head);
  expect([readFileSync(join(repo.directory, 'b.txt'), 'utf8'), readFileSync(join(repo.directory, 'c.txt'), 'utf8')]).toStrictEqual(['two\n', 'three\n']);
});

test('it folds an edit into the rebased commit', async () => {
  const ctx = setupTest();
  const repo = await createStubRebaseRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'a.txt': 'one\n' }], change: { 'b.txt': 'two\n' } });

  const head = await repo.rebase({ 'b.txt': 'twelve\n' });

  const shown = await realRunner(['git', 'show', `${head}:b.txt`], { cwd: repo.directory });
  expect(shown.stdout).toBe('twelve\n');
});

test('it serves a squash of the PR onto main as one commit', async () => {
  const ctx = setupTest();
  const repo = await createStubRebaseRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'a.txt': 'one\n' }], change: { 'b.txt': 'two\n' } });

  await repo.moveMain({ 'c.txt': 'three\n' });
  const head = await repo.squash();

  const parents = await realRunner(['git', 'rev-list', '--parents', '-n', '1', head], { cwd: repo.directory });
  const served = await repo.readServedHead();
  expect(served).toBe(head);
  expect(parents.stdout.trim().split(' ')).toHaveLength(2);
});

test('it serves a follow-up as a second PR commit, and a squash folds both into one', async () => {
  const ctx = setupTest();
  const repo = await createStubRebaseRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'a.txt': 'one\n' }], change: { 'b.txt': 'two\n' }, followUp: { 'c.txt': 'three\n' } });

  const servedBefore = await repo.readServedHead();
  const before = await realRunner(['git', 'rev-list', '--count', `main..${repo.oldHead}`], { cwd: repo.directory });
  const head = await repo.squash();
  const after = await realRunner(['git', 'rev-list', '--count', `main..${head}`], { cwd: repo.directory });
  const files = await realRunner(['git', 'show', '--name-only', '--format=', head], { cwd: repo.directory });

  expect(servedBefore).toBe(repo.oldHead);
  expect(before.stdout.trim()).toBe('2');
  expect(after.stdout.trim()).toBe('1');
  expect(files.stdout.trim().split('\n')).toStrictEqual(['b.txt', 'c.txt']);
});

test('it reads the tip of main after main moves', async () => {
  const ctx = setupTest();
  const repo = await createStubRebaseRepo({ root: ctx.root, repo: 'widgets', pr: 7, history: [{ 'a.txt': 'one\n' }], change: { 'b.txt': 'two\n' } });
  await repo.moveMain({ 'c.txt': 'three\n' });

  const tip = await repo.readMainHead();

  const pushed = await realRunner(['git', 'ls-remote', 'origin', 'refs/heads/main'], { cwd: repo.directory });
  expect(tip).toBe(pushed.stdout.split('\t')[0] ?? '');
});
