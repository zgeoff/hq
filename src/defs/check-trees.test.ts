import { expect, test } from 'bun:test';
import { createTreeFixture } from '../../test/create-tree-fixture.ts';
import { checkTrees } from './check-trees.ts';
import { spawnGrants } from './spawn-grants.ts';

test('it starts the grants check with bun, not the running binary, from the hq-defs checkout', () => {
  const calls: { argv: string[]; cwd: string }[] = [],
    trees = createTreeFixture().createBoth();
  checkTrees('hq', (argv, cwd) => {
    calls.push({ argv, cwd });
    return spawnGrants(argv, cwd);
  });
  expect(calls).toStrictEqual([{ argv: ['bun', 'scripts/grants.ts', '--check', '--private', trees.private.dir], cwd: trees.hq.dir }]);
});

test('it fails with a grants line, not a crash, when bun cannot start', () => {
  createTreeFixture().createBoth();
  const checks = checkTrees('hq', () => {
    throw new Error('Executable not found in $PATH: "bun"');
  });
  expect(checks.filter((check) => !check.ok).map((check) => check.line)).toStrictEqual(['grants: could not start bun: Executable not found in $PATH: "bun"']);
});
