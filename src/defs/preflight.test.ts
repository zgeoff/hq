import { expect, test } from 'bun:test';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createTreeCheckout } from '../../test/create-tree-checkout.ts';
import { INTAKE, buildPrompt, createTreeFixture } from '../../test/create-tree-fixture.ts';
import { readPrivateFixture } from '../../test/read-private-fixture.ts';
import { PRIVATE_TREE } from '../prompts/private-tree.ts';
import { spawnGrants } from './check-grants.ts';
import { checkTrees, preflight } from './preflight.ts';

test('it passes with both trees in place, and runs the grants check', () => {
  createTreeFixture().createBoth();
  const checks = preflight('hq');
  expect(checks.filter((check) => !check.ok)).toStrictEqual([]);
  expect(checks.map((check) => check.line)).toContain("grants: hq-private's grants and prompts match (grants: 4 files match)");
});

test('it starts the grants check with bun, not the running binary, from the hq-defs checkout', () => {
  const calls: { argv: string[]; cwd: string }[] = [],
    trees = createTreeFixture().createBoth();
  checkTrees('hq', (argv, cwd) => {
    calls.push({ argv, cwd });
    return spawnGrants(argv, cwd);
  });
  expect(calls).toStrictEqual([{ argv: ['bun', 'scripts/grants.ts', '--check', '--private', trees.private.dir], cwd: trees.hq.dir }]);
});

test('it fails closed when hq-private is missing a prompt, though hq-defs holds one', () => {
  const ctx = createTreeFixture();
  ctx.createHq({ ...readPrivateFixture().hqFiles, [INTAKE]: buildPrompt('intake in defs') });
  createTreeCheckout(ctx.dir, 'private', { 'skills/linear-triage/references/session-prompt.md': buildPrompt('triage') });
  {
    const lines = preflight('hq')
      .filter((check) => !check.ok)
      .map((check) => check.line);
    expect(lines).toContainEqual(expect.stringContaining(`can't read ${INTAKE} from origin/main in ${PRIVATE_TREE.dir()}`));
  }
});

test('it fails with no hq-private checkout', () => {
  createTreeFixture().createHq();
  expect(preflight('hq').filter((check) => !check.ok)).toStrictEqual([{ ok: false, line: `${PRIVATE_TREE.dir()} is not a checkout (hq defs setup private)` }]);
});

test("it fails when hq-private's origin is another repo", () => {
  const ctx = createTreeFixture();
  ctx.createHq();
  ctx.createPrivate().git('remote', 'set-url', 'origin', 'git@github.com:zgeoff/hq.git');
  expect(preflight('hq').filter((check) => !check.ok)).toStrictEqual([{ ok: false, line: expect.stringContaining('not zgeoff/hq-private') }]);
});

test('it fails on a drifted private prompt, with the output of the grants script', () => {
  const checkouts = createTreeFixture().createBoth(),
    promptFile = `${checkouts.private.dir}/skills/preview-qa/references/session-prompt.md`;
  writeFileSync(promptFile, readFileSync(promptFile, 'utf8').replace('- Water: pour the water.', '- Water: pour every drop.'));
  {
    const failed = preflight('hq').filter((check) => !check.ok);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.line).toContain('grants: grants.ts --check --private failed (exit 1)');
    expect(failed[0]?.line).toContain('--- a/hq-private:skills/preview-qa/references/session-prompt.md');
    expect(failed[0]?.line).toContain('+- Water: pour the water.');
  }
});

test('it fails when the hq-defs checkout has no grants script', () => {
  const trees = createTreeFixture().createBoth();
  rmSync(`${trees.hq.dir}/scripts/grants.ts`);
  expect(preflight('hq').filter((check) => !check.ok)).toStrictEqual([{ ok: false, line: expect.stringContaining('scripts/grants.ts is missing') }]);
});

test('it fails with a grants line, not a crash, when bun cannot start', () => {
  createTreeFixture().createBoth();
  const checks = checkTrees('hq', () => {
    throw new Error('Executable not found in $PATH: "bun"');
  });
  expect(checks.filter((check) => !check.ok).map((check) => check.line)).toStrictEqual(['grants: could not start bun: Executable not found in $PATH: "bun"']);
});
