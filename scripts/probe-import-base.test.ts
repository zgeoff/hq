import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeImportBase } from './probe-import-base.ts';

function setupTest() {
  const directory = mkdtempSync(join(process.env['TMPDIR'] ?? tmpdir(), 'hq-import-base-'));
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

    // Writes the files and commits them on the current branch.
    commit: (files: Record<string, string>): void => {
      for (const [path, text] of Object.entries(files)) {
        writeFileSync(join(directory, path), text);
      }
      runGit(['add', '-A']);
      runGit(['-c', 'user.name=Kettle Bot', '-c', 'user.email=kettle@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'kettle']);
    },
    branch: (name: string): void => runGit(['checkout', '--quiet', '-b', name]),
  };
}

test('a branch onto a base with no package.json is an import, so the lint skips', () => {
  const repo = setupTest();
  repo.commit({ 'README.md': '# kettle\n' });
  repo.branch('import');
  repo.commit({ 'package.json': '{"name":"kettle"}\n', 'kettle.ts': 'export const water = 1;\n' });

  expect(probeImportBase('main', repo.directory)).toBe(true);
});

test('a branch onto a base that holds package.json is linted as usual', () => {
  const repo = setupTest();
  repo.commit({ 'package.json': '{"name":"kettle"}\n', 'kettle.ts': 'export const water = 1;\n' });
  repo.branch('change');
  repo.commit({ 'kettle.ts': 'export const water = 2;\n' });

  expect(probeImportBase('main', repo.directory)).toBe(false);
});

test('a base git cannot resolve throws instead of skipping the lint', () => {
  const repo = setupTest();
  repo.commit({ 'package.json': '{"name":"kettle"}\n' });

  expect(() => probeImportBase('origin/teapot', repo.directory)).toThrow(/git merge-base HEAD origin\/teapot exited/u);
});
