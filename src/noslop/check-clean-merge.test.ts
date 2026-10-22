import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanEnv } from '../runner/clean-env.ts';
import { realRunner } from '../runner/real-runner.ts';
import { buildFakeRunner } from '../../test/noslop-fake.ts';
import { checkCleanMerge } from './check-clean-merge.ts';

// An empty real repo on branch main, read with no global or system git config.
async function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'hq-clean-merge-')),
    env = cleanEnv({ GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'Badger', GIT_AUTHOR_EMAIL: 'badger@example.test', GIT_COMMITTER_NAME: 'Badger', GIT_COMMITTER_EMAIL: 'badger@example.test' }),
    runGit = (...args: string[]) => realRunner(['git', ...args], { cwd: dir, env });

  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  await runGit('init', '-q', '-b', 'main');

  return { dir, runGit };
}

test('it calls a merge of two parents with git’s own merged tree clean', async () => {
  const ctx = await setupTest();
  writeFileSync(join(ctx.dir, 'kettle.txt'), 'cold\n');
  writeFileSync(join(ctx.dir, 'lid.txt'), 'shut\n');
  await ctx.runGit('add', '-A');
  await ctx.runGit('commit', '-q', '-m', 'base');
  await ctx.runGit('checkout', '-q', '-b', 'feat');
  writeFileSync(join(ctx.dir, 'kettle.txt'), 'hot\n');
  await ctx.runGit('commit', '-q', '-am', 'boil');
  await ctx.runGit('checkout', '-q', 'main');
  writeFileSync(join(ctx.dir, 'lid.txt'), 'open\n');
  await ctx.runGit('commit', '-q', '-am', 'open lid');
  await ctx.runGit('checkout', '-q', 'feat');
  await ctx.runGit('merge', '-q', '--no-edit', 'main');

  expect(checkCleanMerge(realRunner, ctx.dir, 'HEAD')).resolves.toBe(true);
});

test('it calls a merge that resolved a conflict not clean', async () => {
  const ctx = await setupTest();
  writeFileSync(join(ctx.dir, 'kettle.txt'), 'cold\n');
  writeFileSync(join(ctx.dir, 'lid.txt'), 'shut\n');
  await ctx.runGit('add', '-A');
  await ctx.runGit('commit', '-q', '-m', 'base');
  await ctx.runGit('checkout', '-q', '-b', 'feat');
  writeFileSync(join(ctx.dir, 'kettle.txt'), 'hot\n');
  await ctx.runGit('commit', '-q', '-am', 'boil');
  await ctx.runGit('checkout', '-q', 'main');
  writeFileSync(join(ctx.dir, 'kettle.txt'), 'warm\n');
  await ctx.runGit('commit', '-q', '-am', 'warm');
  await ctx.runGit('checkout', '-q', 'feat');
  await ctx.runGit('merge', '-q', '--no-edit', 'main');
  writeFileSync(join(ctx.dir, 'kettle.txt'), 'hot and warm\n');
  await ctx.runGit('commit', '-q', '-am', 'merge main');

  expect(checkCleanMerge(realRunner, ctx.dir, 'HEAD')).resolves.toBe(false);
});

test('it calls a merge with a hand edit not clean', async () => {
  const ctx = await setupTest();
  writeFileSync(join(ctx.dir, 'kettle.txt'), 'cold\n');
  writeFileSync(join(ctx.dir, 'lid.txt'), 'shut\n');
  await ctx.runGit('add', '-A');
  await ctx.runGit('commit', '-q', '-m', 'base');
  await ctx.runGit('checkout', '-q', '-b', 'feat');
  writeFileSync(join(ctx.dir, 'kettle.txt'), 'hot\n');
  await ctx.runGit('commit', '-q', '-am', 'boil');
  await ctx.runGit('checkout', '-q', 'main');
  writeFileSync(join(ctx.dir, 'lid.txt'), 'open\n');
  await ctx.runGit('commit', '-q', '-am', 'open lid');
  await ctx.runGit('checkout', '-q', 'feat');
  await ctx.runGit('merge', '-q', '--no-edit', 'main');
  writeFileSync(join(ctx.dir, 'kettle.txt'), 'boiling\n');
  await ctx.runGit('commit', '-q', '-a', '--amend', '--no-edit');

  expect(checkCleanMerge(realRunner, ctx.dir, 'HEAD')).resolves.toBe(false);
});

test('it calls a commit with one parent not a clean merge', async () => {
  const ctx = await setupTest();
  writeFileSync(join(ctx.dir, 'kettle.txt'), 'cold\n');
  writeFileSync(join(ctx.dir, 'lid.txt'), 'shut\n');
  await ctx.runGit('add', '-A');
  await ctx.runGit('commit', '-q', '-m', 'base');
  writeFileSync(join(ctx.dir, 'kettle.txt'), 'hot\n');
  await ctx.runGit('commit', '-q', '-am', 'boil');

  expect(checkCleanMerge(realRunner, ctx.dir, 'HEAD')).resolves.toBe(false);
});

test('it throws when git cannot read the commit\'s parents', async () => {
  const ctx = await setupTest();

  expect(checkCleanMerge(realRunner, ctx.dir, 'HEAD')).rejects.toMatchObject({ name: 'GitReadError', message: expect.stringMatching(/^git cannot read the parents of HEAD: fatal: /u) });
});

test('it throws when git merge-tree fails rather than reporting conflicts', async () => {
  const ctx = await setupTest(),
    fake = buildFakeRunner({ git: { 'git rev-list --parents -n 1 dddd000000000000000000000000000000000004': { code: 0, stdout: 'dddd000000000000000000000000000000000004 aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003\n', stderr: '' }, 'git merge-tree --write-tree aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003': { code: 128, stdout: '', stderr: 'fatal: unknown commit\n' } } });

  expect(checkCleanMerge(fake.run, ctx.dir, 'dddd000000000000000000000000000000000004')).rejects.toMatchObject({ name: 'GitReadError', message: 'git cannot merge the parents of dddd000: fatal: unknown commit' });
});

test('it throws when git cannot read the merge\'s tree', async () => {
  const ctx = await setupTest(),
    fake = buildFakeRunner({ git: { 'git rev-list --parents -n 1 dddd000000000000000000000000000000000004': { code: 0, stdout: 'dddd000000000000000000000000000000000004 aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003\n', stderr: '' }, 'git merge-tree --write-tree aaaa000000000000000000000000000000000001 bbbb000000000000000000000000000000000003': { code: 0, stdout: 'eeee000000000000000000000000000000000005\n', stderr: '' }, 'git rev-parse dddd000000000000000000000000000000000004^{tree}': { code: 128, stdout: '', stderr: 'fatal: bad revision\n' } } });

  expect(checkCleanMerge(fake.run, ctx.dir, 'dddd000000000000000000000000000000000004')).rejects.toMatchObject({ name: 'GitReadError', message: 'git cannot read the tree of dddd000: fatal: bad revision' });
});
