import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isChanged, parseChanges } from './lint-changed.ts';
import { readDiff } from './read-diff.ts';

function setupTest() {
  const dir = mkdtempSync(join(process.env['TMPDIR'] ?? tmpdir(), 'hq-read-diff-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  runGit(dir, ['init', '--quiet', '--initial-branch=main']);
  return {
    directory: dir,
    // Commits kettle.ts as `before`, then deletes it and stages `after`: the diff lint:changed reads.
    splitKettle: (before: string, after: Record<string, string>): ReturnType<typeof parseChanges> => {
      writeFileSync(join(dir, 'kettle.ts'), before);
      runGit(dir, ['add', '-A']);
      runGit(dir, ['-c', 'user.name=Kettle Bot', '-c', 'user.email=kettle@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'kettle']);
      rmSync(join(dir, 'kettle.ts'));
      for (const [path, text] of Object.entries(after)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), text);
      }
      runGit(dir, ['add', '-A']);
      return parseChanges(readDiff('HEAD', dir));
    },
  };
}

function runGit(dir: string, args: string[]): void {
  const result = Bun.spawnSync(['git', ...args], { cwd: dir });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')}: ${result.stderr.toString()}`);
  }
}

// kettle.ts is split 3 ways, so no new file is alike enough for git to call it a rename: it shows as deleted.
test('a file deleted and split into new ones, read from git, counts as moved', () => {
  const app = setupTest(),
    parts = {
      boil: ['export function boilWater(litres: number): number {', '  const minutes = litres * 3;', '  return minutes;', '}', ''].join('\n'),
      pour: ['export function pourTea(cups: number): number {', '  const millilitres = cups * 250;', '  return millilitres;', '}', ''].join('\n'),
      warm: ['export function warmPot(seconds: number): number {', '  const degrees = seconds / 4;', '  return degrees;', '}', ''].join('\n'),
    },
    split = app.splitKettle(`${parts.boil}\n${parts.pour}\n${parts.warm}`, {
      'kettle/boil-water.ts': `// Boils the water.\n${parts.boil}`,
      'kettle/pour-tea.ts': parts.pour,
      'kettle/warm-pot.ts': parts.warm,
    });

  expect([2, 3, 4, 5].map((line) => checkLine(split, line))).toStrictEqual([false, false, false, false]);
  expect(checkLine(split, 1)).toBe(true);
});

test('it rejects a base that git cannot resolve instead of reading no changes', () => {
  const ctx = setupTest();

  expect(() => readDiff('origin/no-such-base', ctx.directory)).toThrow(/^git diff --merge-base origin\/no-such-base failed \(128\): fatal: /u);
});

function checkLine(changes: ReturnType<typeof parseChanges>, line: number): boolean {
  return isChanged({ code: 'eslint(one-var)', filename: 'kettle/boil-water.ts', labels: [{ span: { line } }], message: 'one-var' }, changes);
}
