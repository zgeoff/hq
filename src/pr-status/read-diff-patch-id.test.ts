import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGitRepo } from '../../test/create-git-repo.ts';
import { realRunner } from '../runner/real-runner.ts';
import { readDiffPatchID } from './read-diff-patch-id.ts';

async function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-diff-patch-id-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return await createGitRepo(directory);
}

test('it reads the patch-id of a PR diff that changes a file', async () => {
  const ctx = await setupTest();
  await ctx.commit({ 'kettle.txt': 'boil\n' }, 'start');
  await ctx.git('checkout', '-q', '-b', 'pour');
  const head = await ctx.commit({ 'kettle.txt': 'boil and pour\n' }, 'pour');

  expect(await readDiffPatchID(realRunner, ctx.directory, 'main', head)).toStrictEqual({ kind: 'patch-id', id: expect.stringMatching(/^[0-9a-f]{40}$/u) });
});

test('it reads a PR diff whose content is already on the base as empty', async () => {
  const ctx = await setupTest();
  await ctx.commit({ 'kettle.txt': 'boil\n' }, 'start');
  await ctx.git('checkout', '-q', '-b', 'pour');
  const head = await ctx.commit({ 'kettle.txt': 'boil and pour\n' }, 'pour');
  await ctx.git('checkout', '-q', 'main');
  await ctx.git('merge', '-q', '--ff-only', head);

  expect(await readDiffPatchID(realRunner, ctx.directory, 'main', head)).toStrictEqual({ kind: 'empty' });
});

test('it reads a head git cannot find as unreadable', async () => {
  const ctx = await setupTest();
  await ctx.commit({ 'kettle.txt': 'boil\n' }, 'start');

  expect(await readDiffPatchID(realRunner, ctx.directory, 'main', 'e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1')).toStrictEqual({ kind: 'unreadable' });
});
