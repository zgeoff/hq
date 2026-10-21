import { expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { createTreeFixture } from '../../test/create-tree-fixture.ts';
import { TREES } from '../prompts/trees.ts';
import { setupCheckout } from './setup-checkout.ts';

test.each(['hq', 'private'] as const)("it clones the %s tree's repo into its directory, once", async (tree) => {
  createTreeFixture();
  const calls: string[][] = [],
    run = async (cmd: string[]) => {
      calls.push(cmd);
      mkdirSync(`${cmd[4]}/.git`, { recursive: true });
      return await Promise.resolve({ code: 0, stdout: '', stderr: '' });
    };
  await expect(setupCheckout(run, tree)).resolves.toStrictEqual({ dir: TREES[tree].dir(), made: true });
  await expect(setupCheckout(run, tree)).resolves.toStrictEqual({ dir: TREES[tree].dir(), made: false });
  expect(calls).toStrictEqual([['gh', 'repo', 'clone', TREES[tree].repo, TREES[tree].dir(), '--', '-q']]);
});
