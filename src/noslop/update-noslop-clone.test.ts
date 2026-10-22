import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFakeRunner } from '../../test/noslop-fake.ts';
import type { Runner } from '../runner/types.ts';
import { updateNoslopClone } from './update-noslop-clone.ts';

function setupTest() {
  const base = mkdtempSync(join(tmpdir(), 'hq-noslop-run-'));

  onTestFinished(() => rmSync(base, { recursive: true, force: true }));

  return { base };
}

test('it pins a commit in its own folder: fetch, resolve the full sha, add a worktree, install without scripts', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    folder = `${ctx.base}-0123456789abcdef0123456789abcdef01234567`;
  onTestFinished(() => rmSync(folder, { recursive: true, force: true }));
  const result = await updateNoslopClone(fake.run, ctx.base, '0123456');

  expect(result).toStrictEqual({ sha: '0123456789abcdef0123456789abcdef01234567', clone: folder });
  expect(fake.lines()).toStrictEqual([
    'git fetch -q origin',
    'git rev-parse --verify 0123456^{commit}',
    `git worktree remove --force ${folder}`,
    'git worktree prune',
    `git worktree add -q --detach ${folder} 0123456789abcdef0123456789abcdef01234567`,
    'bun install --frozen-lockfile --ignore-scripts',
  ]);
});

test('it reuses a commit folder that is already installed', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner(),
    folder = `${ctx.base}-0123456789abcdef0123456789abcdef01234567`;
  mkdirSync(`${folder}/node_modules`, { recursive: true });
  onTestFinished(() => rmSync(folder, { recursive: true, force: true }));
  writeFileSync(`${folder}/node_modules/.hq-install-complete`, '');

  await expect(updateNoslopClone(fake.run, ctx.base, '0123456')).resolves.toStrictEqual({ sha: '0123456789abcdef0123456789abcdef01234567', clone: folder });

  expect(fake.lines()).toStrictEqual(['git fetch -q origin', 'git rev-parse --verify 0123456^{commit}']);
});

test('it installs again in a commit folder whose install stopped before it completed', async () => {
  const ctx = setupTest();
  const fake = buildFakeRunner();
  const folder = `${ctx.base}-0123456789abcdef0123456789abcdef01234567`;
  mkdirSync(`${folder}/node_modules`, { recursive: true });
  onTestFinished(() => rmSync(folder, { recursive: true, force: true }));

  await updateNoslopClone(fake.run, ctx.base, '0123456');

  expect(fake.lines()).toStrictEqual([
    'git fetch -q origin',
    'git rev-parse --verify 0123456^{commit}',
    `git worktree remove --force ${folder}`,
    'git worktree prune',
    `git worktree add -q --detach ${folder} 0123456789abcdef0123456789abcdef01234567`,
    'bun install --frozen-lockfile --ignore-scripts',
  ]);
  expect(existsSync(`${folder}/node_modules/.hq-install-complete`)).toBe(true);
});

test('it removes the commit folder when the install fails', async () => {
  const ctx = setupTest(),
    folder = `${ctx.base}-${'abc1234'.padEnd(40, '0')}`,
    lines: string[] = [],
    run: Runner = (cmd) => {
      lines.push(cmd.join(' '));
      if (cmd[0] === 'bun') {
        return Promise.resolve({ code: 1, stdout: '', stderr: 'lockfile out of date' });
      }
      return Promise.resolve({ code: 0, stdout: `${'abc1234'.padEnd(40, '0')}\n`, stderr: '' });
    };

  await expect(updateNoslopClone(run, ctx.base, 'abc1234')).rejects.toMatchObject({ code: 'command_failed' });

  expect(lines.at(-1)).toBe(`git worktree remove --force ${folder}`);
});

test('it clones noslop on first use before it pins', async () => {
  const ctx = setupTest(),
    fake = buildFakeRunner();

  await updateNoslopClone(fake.run, join(ctx.base, 'cache', 'zgeoff', 'noslop'), 'abc1234');

  expect(fake.calls[0]?.cmd).toStrictEqual(['gh', 'repo', 'clone', 'zgeoff/noslop', join(ctx.base, 'cache', 'zgeoff', 'noslop'), '--', '-q']);
});
