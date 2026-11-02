import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readTestScope } from './read-test-scope.ts';

function setupTest() {
  const directory = mkdtempSync(join(process.env['TMPDIR'] ?? tmpdir(), 'hq-test-scope-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const runGit = (args: string[]): void => {
    const result = Bun.spawnSync(['git', ...args], { cwd: directory });
    if (result.exitCode !== 0) {
      throw new Error(`git ${args.join(' ')}: ${result.stderr.toString()}`);
    }
  };
  runGit(['init', '--quiet', '--initial-branch=main']);
  return {
    directory,

    commit: (files: Record<string, string>): void => {
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(directory, path)), { recursive: true });
        writeFileSync(join(directory, path), text);
      }
      runGit(['add', '-A']);
      runGit(['-c', 'user.name=Kettle Bot', '-c', 'user.email=kettle@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'kettle']);
    },
    branch: (name: string): void => runGit(['checkout', '--quiet', '-b', name]),
    runScript: (base: string): string => {
      const output = join(directory, '.github-output');
      const result = Bun.spawnSync([process.execPath, join(import.meta.dir, 'read-test-scope.ts')], {
        cwd: directory,
        env: { ...process.env, TEST_BASE: base, GITHUB_OUTPUT: output },
      });
      if (result.exitCode !== 0) {
        throw new Error(`read-test-scope: ${result.stderr.toString()}`);
      }
      return readFileSync(output, 'utf8');
    },
  };
}

test('it skips the tests on a branch that changes only docs', () => {
  const repo = setupTest();
  repo.commit({ 'kettle.ts': 'export const water = 1;\n' });
  repo.branch('docs');
  repo.commit({ 'docs/kettle.md': '# Kettle\n' });

  expect(readTestScope('main', repo.directory)).toBe('skip');
});

test('it runs the tests on a branch that changes code', () => {
  const repo = setupTest();
  repo.commit({ 'kettle.ts': 'export const water = 1;\n' });
  repo.branch('code');
  repo.commit({ 'docs/kettle.md': '# Kettle\n', 'kettle.ts': 'export const water = 2;\n' });

  expect(readTestScope('main', repo.directory)).toBe('run');
});

test('it runs the tests on a push, which has no base', () => {
  const repo = setupTest();
  repo.commit({ 'docs/kettle.md': '# Kettle\n' });

  expect(readTestScope('', repo.directory)).toBe('run');
});

test('it fails the step on a base git cannot find', () => {
  const repo = setupTest();
  repo.commit({ 'docs/kettle.md': '# Kettle\n' });

  expect(() => readTestScope('origin/teapot', repo.directory)).toThrow('git diff --merge-base origin/teapot failed');
});

test('it writes tests=skip to the GitHub output for a docs-only branch', () => {
  const repo = setupTest();
  repo.commit({ 'kettle.ts': 'export const water = 1;\n' });
  repo.branch('docs');
  repo.commit({ 'docs/kettle.md': '# Kettle\n' });

  expect(repo.runScript('main')).toBe('tests=skip\n');
});

test('it writes tests=run to the GitHub output for a push, which has no base', () => {
  const repo = setupTest();
  repo.commit({ 'docs/kettle.md': '# Kettle\n' });

  expect(repo.runScript('')).toBe('tests=run\n');
});
