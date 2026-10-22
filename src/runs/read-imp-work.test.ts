import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildStubImpRunner } from '../../test/build-stub-imp-runner.ts';
import { readImpWork } from './read-imp-work.ts';

// A temp directory, and git run in it under an invented identity.
function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-imp-work-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const git = (args: string[]) => Bun.spawnSync(['git', '-c', 'user.name=Kettle Bot', '-c', 'user.email=kettle@example.invalid', ...args], { cwd: directory, stdout: 'ignore', stderr: 'ignore' });
  return { directory, git };
}

test('an imp whose clone has every commit on a remote branch and nothing uncommitted has all its work pushed; the check runs in the session imp and folder', async () => {
  const ctx = setupTest();
  const clone = join(ctx.directory, 'kettle');
  ctx.git(['init', '-q', '--bare', '-b', 'main', join(ctx.directory, 'remote.git')]);
  ctx.git(['clone', '-q', join(ctx.directory, 'remote.git'), clone]);
  writeFileSync(join(clone, 'lid.ts'), 'export const lid = 1;\n');
  ctx.git(['-C', clone, 'add', '.']);
  ctx.git(['-C', clone, 'commit', '-q', '-m', 'add kettle lid']);
  ctx.git(['-C', clone, 'push', '-q', 'origin', 'main']);
  const imps = buildStubImpRunner({ imps: ['home-0000c001aaaa4aaa8aaa', 'home-0000b001aaaa4aaa8aaa'] });

  const work = await readImpWork(imps.run, '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', clone);

  expect(work).toStrictEqual({ state: 'pushed' });
  expect(imps.commands.map((cmd) => cmd.filter((part) => !part.includes('\n')))).toStrictEqual([
    ['imp', 'ls', '--json'],
    ['imp', 'exec', 'home-0000b001aaaa4aaa8aaa', '--', 'sh', '-c', 'sh', clone],
  ]);
});

test('an uncommitted change is unpushed work', async () => {
  const ctx = setupTest();
  const clone = join(ctx.directory, 'kettle');
  ctx.git(['init', '-q', '--bare', '-b', 'main', join(ctx.directory, 'remote.git')]);
  ctx.git(['clone', '-q', join(ctx.directory, 'remote.git'), clone]);
  writeFileSync(join(clone, 'lid.ts'), 'export const lid = 1;\n');
  ctx.git(['-C', clone, 'add', '.']);
  ctx.git(['-C', clone, 'commit', '-q', '-m', 'add kettle lid']);
  ctx.git(['-C', clone, 'push', '-q', 'origin', 'main']);
  const imps = buildStubImpRunner({ imps: ['home-0000c001aaaa4aaa8aaa', 'home-0000b001aaaa4aaa8aaa'] });
  writeFileSync(join(clone, 'spout.ts'), 'export const spout = 1;\n');

  const work = await readImpWork(imps.run, '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', clone);

  expect(work).toStrictEqual({ state: 'unpushed', detail: `home-0000b001aaaa4aaa8aaa: ${clone}: ?? spout.ts` });
});

test('a commit no remote branch holds is unpushed work', async () => {
  const ctx = setupTest();
  const clone = join(ctx.directory, 'kettle');
  ctx.git(['init', '-q', '--bare', '-b', 'main', join(ctx.directory, 'remote.git')]);
  ctx.git(['clone', '-q', join(ctx.directory, 'remote.git'), clone]);
  writeFileSync(join(clone, 'lid.ts'), 'export const lid = 1;\n');
  ctx.git(['-C', clone, 'add', '.']);
  ctx.git(['-C', clone, 'commit', '-q', '-m', 'add kettle lid']);
  ctx.git(['-C', clone, 'push', '-q', 'origin', 'main']);
  const imps = buildStubImpRunner({ imps: ['home-0000c001aaaa4aaa8aaa', 'home-0000b001aaaa4aaa8aaa'] });
  writeFileSync(join(clone, 'spout.ts'), 'export const spout = 1;\n');
  ctx.git(['-C', clone, 'add', '.']);
  ctx.git(['-C', clone, 'commit', '-q', '-m', 'add kettle spout']);

  const work = await readImpWork(imps.run, '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', clone);

  expect(work.state === 'unpushed' && work.detail.endsWith(' add kettle spout')).toBe(true);
});

test('an uncommitted change in a second worktree whose path holds a space is unpushed work', async () => {
  const ctx = setupTest();
  const clone = join(ctx.directory, 'kettle');
  ctx.git(['init', '-q', '--bare', '-b', 'main', join(ctx.directory, 'remote.git')]);
  ctx.git(['clone', '-q', join(ctx.directory, 'remote.git'), clone]);
  writeFileSync(join(clone, 'lid.ts'), 'export const lid = 1;\n');
  ctx.git(['-C', clone, 'add', '.']);
  ctx.git(['-C', clone, 'commit', '-q', '-m', 'add kettle lid']);
  ctx.git(['-C', clone, 'push', '-q', 'origin', 'main']);
  const imps = buildStubImpRunner({ imps: ['home-0000c001aaaa4aaa8aaa', 'home-0000b001aaaa4aaa8aaa'] });
  const tree = join(ctx.directory, 'kettle spout');
  ctx.git(['-C', clone, 'worktree', 'add', '-q', '-b', 'spout', tree]);
  writeFileSync(join(tree, 'spout.ts'), 'export const spout = 1;\n');

  const work = await readImpWork(imps.run, '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', clone);

  expect(work).toStrictEqual({ state: 'unpushed', detail: `home-0000b001aaaa4aaa8aaa: ${tree}: ?? spout.ts` });
});

test('a worktree whose status check fails gives no answer, even when every other check passes', async () => {
  const ctx = setupTest();
  const clone = join(ctx.directory, 'kettle');
  ctx.git(['init', '-q', '--bare', '-b', 'main', join(ctx.directory, 'remote.git')]);
  ctx.git(['clone', '-q', join(ctx.directory, 'remote.git'), clone]);
  writeFileSync(join(clone, 'lid.ts'), 'export const lid = 1;\n');
  ctx.git(['-C', clone, 'add', '.']);
  ctx.git(['-C', clone, 'commit', '-q', '-m', 'add kettle lid']);
  ctx.git(['-C', clone, 'push', '-q', 'origin', 'main']);
  const imps = buildStubImpRunner({ imps: ['home-0000c001aaaa4aaa8aaa', 'home-0000b001aaaa4aaa8aaa'] });
  const tree = join(ctx.directory, 'kettle-handle');
  ctx.git(['-C', clone, 'worktree', 'add', '-q', '-b', 'handle', tree]);
  rmSync(tree, { recursive: true, force: true });

  const work = await readImpWork(imps.run, '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', clone);

  expect(work.state).toBe('unknown');
});

test('a commit no remote branch holds on the detached HEAD of a second worktree is unpushed work', async () => {
  const ctx = setupTest();
  const clone = join(ctx.directory, 'kettle');
  ctx.git(['init', '-q', '--bare', '-b', 'main', join(ctx.directory, 'remote.git')]);
  ctx.git(['clone', '-q', join(ctx.directory, 'remote.git'), clone]);
  writeFileSync(join(clone, 'lid.ts'), 'export const lid = 1;\n');
  ctx.git(['-C', clone, 'add', '.']);
  ctx.git(['-C', clone, 'commit', '-q', '-m', 'add kettle lid']);
  ctx.git(['-C', clone, 'push', '-q', 'origin', 'main']);
  const imps = buildStubImpRunner({ imps: ['home-0000c001aaaa4aaa8aaa', 'home-0000b001aaaa4aaa8aaa'] });
  const tree = join(ctx.directory, 'kettle-base');
  ctx.git(['-C', clone, 'worktree', 'add', '-q', '--detach', tree]);
  writeFileSync(join(tree, 'base.ts'), 'export const base = 1;\n');
  ctx.git(['-C', tree, 'add', '.']);
  ctx.git(['-C', tree, 'commit', '-q', '-m', 'add kettle base']);

  const work = await readImpWork(imps.run, '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', clone);

  expect(work.state === 'unpushed' && work.detail.endsWith(' add kettle base')).toBe(true);
});

test('a check that exits nonzero gives no answer', async () => {
  const imps = buildStubImpRunner({ imps: ['home-0000b001aaaa4aaa8aaa'], exec: { code: 124, stdout: '', stderr: 'timed out\n' } });

  const work = await readImpWork(imps.run, '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '/workspace/kettle');

  expect(work).toStrictEqual({ state: 'unknown', detail: 'the check in home-0000b001aaaa4aaa8aaa exited 124: timed out' });
});

test('a folder that is no clone gives no answer', async () => {
  const ctx = setupTest();
  const imps = buildStubImpRunner({ imps: ['home-0000b001aaaa4aaa8aaa'] });

  const work = await readImpWork(imps.run, '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ctx.directory);

  expect(work.state).toBe('unknown');
});

test('a session with no imp gives no answer', async () => {
  const imps = buildStubImpRunner({ imps: ['home-0000b001aaaa4aaa8aaa'] });

  const work = await readImpWork(imps.run, '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '/workspace/kettle');

  expect(work).toStrictEqual({ state: 'unknown', detail: 'no imp ends with 0000d001aaaa4aaa8aaa' });
});

test('a session with no working directory gives no answer, and runs nothing', async () => {
  const imps = buildStubImpRunner({ imps: ['home-0000b001aaaa4aaa8aaa'] });

  const work = await readImpWork(imps.run, '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null);

  expect(work).toStrictEqual({ state: 'unknown', detail: 'atc gave no working directory for the session' });
  expect(imps.commands).toStrictEqual([]);
});
