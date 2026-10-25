import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realRunner } from '../runner/real-runner.ts';
import { readPRPatchID } from './read-pr-patch-id.ts';

// A repo whose main holds kettle.txt, with a git helper that fails loudly and a commit helper.
async function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-patch-id-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const git = async (...args: string[]): Promise<string> => {
    const result = await realRunner(['git', '-c', 'user.name=Kettle', '-c', 'user.email=kettle@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: directory });
    if (result.code !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
    }
    return result.stdout.trim();
  };
  const commit = async (files: Record<string, string>, message: string): Promise<string> => {
    for (const [path, text] of Object.entries(files)) {
      writeFileSync(join(directory, path), text);
    }
    await git('add', '-A');
    await git('commit', '-q', '-m', message);
    return await git('rev-parse', 'HEAD');
  };
  await git('init', '-q', '-b', 'main');
  await commit({ 'kettle.txt': 'boil\n' }, 'start');
  return { directory, git, commit };
}

test('a PR rebased onto a moved base keeps its patch-id', async () => {
  const ctx = await setupTest();
  await ctx.git('checkout', '-q', '-b', 'pour');
  const first = await ctx.commit({ 'pour.txt': 'pour\n  slowly\n' }, 'pour');
  await ctx.git('checkout', '-q', 'main');
  const movedBase = await ctx.commit({ 'lid.txt': 'lid\n' }, 'main moves on');
  await ctx.git('checkout', '-q', 'pour');
  await ctx.git('rebase', '-q', 'main');
  const rebased = await ctx.git('rev-parse', 'HEAD');

  const before = await readPRPatchID(realRunner, ctx.directory, 'main~1', first);
  const after = await readPRPatchID(realRunner, ctx.directory, movedBase, rebased);

  expect(before).toMatch(/^[0-9a-f]{40}$/u);
  expect(after).toBe(before);
});

test('a change of whitespace alone in the PR diff changes its patch-id', async () => {
  const ctx = await setupTest();
  await ctx.git('checkout', '-q', '-b', 'pour');
  const first = await ctx.commit({ 'pour.txt': 'pour\n  slowly\n' }, 'pour');
  const reindented = await ctx.commit({ 'pour.txt': 'pour\n    slowly\n' }, 'indent');

  const before = await readPRPatchID(realRunner, ctx.directory, 'main', first);
  const after = await readPRPatchID(realRunner, ctx.directory, 'main', reindented);

  expect(after).not.toBe(before);
});

test('an empty PR diff or a head git cannot find has no patch-id', async () => {
  const ctx = await setupTest();

  const empty = await readPRPatchID(realRunner, ctx.directory, 'main', 'main');
  const missing = await readPRPatchID(realRunner, ctx.directory, 'main', 'e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1');

  expect(empty).toBeNull();
  expect(missing).toBeNull();
});
