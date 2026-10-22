import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realRunner } from '../runner/real-runner.ts';
import type { RunResult, Runner } from '../runner/types.ts';
import { readImpWork } from './read-imp-work.ts';

// A clone of a bare remote with one pushed commit, and a runner that answers `imp ls --json` with
// two imps and `imp exec` with the given result, or, with 'local', runs the check here.
function setupTest(exec: RunResult | 'local') {
  const directory = mkdtempSync(join(tmpdir(), 'hq-imp-work-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const clone = join(directory, 'kettle');
  const git = (args: string[]) => Bun.spawnSync(['git', '-c', 'user.name=Kettle Bot', '-c', 'user.email=kettle@example.invalid', ...args], { cwd: directory, stdout: 'ignore', stderr: 'ignore' });
  git(['init', '-q', '--bare', '-b', 'main', join(directory, 'remote.git')]);
  git(['clone', '-q', join(directory, 'remote.git'), clone]);
  writeFileSync(join(clone, 'lid.ts'), 'export const lid = 1;\n');
  git(['-C', clone, 'add', '.']);
  git(['-C', clone, 'commit', '-q', '-m', 'add kettle lid']);
  git(['-C', clone, 'push', '-q', 'origin', 'main']);
  const commands: string[][] = [];
  const run: Runner = (cmd, opts) => {
    commands.push(cmd);
    if (cmd[1] === 'ls') {
      return Promise.resolve({ code: 0, stdout: JSON.stringify([{ name: 'home-0000c001aaaa4aaa8aaa' }, { name: 'home-0000b001aaaa4aaa8aaa' }]), stderr: '' });
    }
    if (exec === 'local') {
      return realRunner(cmd.slice(cmd.indexOf('--') + 1), opts);
    }
    return Promise.resolve(exec);
  };
  return { run, commands, clone, git, session: '0000b001-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
}

test('an imp whose clone has every commit on a remote branch and nothing uncommitted has all its work pushed; the check runs in the session imp and folder', async () => {
  const app = setupTest('local');

  const work = await readImpWork(app.run, app.session, app.clone);

  expect(work).toStrictEqual({ state: 'pushed' });
  expect(app.commands.map((cmd) => cmd.filter((part) => !part.includes('\n')))).toStrictEqual([
    ['imp', 'ls', '--json'],
    ['imp', 'exec', 'home-0000b001aaaa4aaa8aaa', '--', 'sh', '-c', 'sh', app.clone],
  ]);
});

test('an uncommitted change, or a commit no remote branch holds, is unpushed work', async () => {
  const app = setupTest('local');
  writeFileSync(join(app.clone, 'spout.ts'), 'export const spout = 1;\n');

  const uncommitted = await readImpWork(app.run, app.session, app.clone);
  app.git(['-C', app.clone, 'add', '.']);
  app.git(['-C', app.clone, 'commit', '-q', '-m', 'add kettle spout']);
  const unpushed = await readImpWork(app.run, app.session, app.clone);

  expect(uncommitted).toStrictEqual({ state: 'unpushed', detail: `home-0000b001aaaa4aaa8aaa: ${app.clone}: ?? spout.ts` });
  expect(unpushed.state === 'unpushed' && unpushed.detail.endsWith(' add kettle spout')).toBe(true);
});

test('a check that exits nonzero, a folder that is no clone, a missing imp or a missing folder gives no answer', async () => {
  const failed = setupTest({ code: 124, stdout: '', stderr: 'timed out\n' });
  const local = setupTest('local');

  const timedOut = await readImpWork(failed.run, failed.session, '/workspace/kettle');
  const noClone = await readImpWork(local.run, local.session, tmpdir());
  const noImp = await readImpWork(failed.run, '0000d001-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '/workspace/kettle');
  const noFolder = await readImpWork(failed.run, failed.session, null);

  expect(timedOut).toStrictEqual({ state: 'unknown', detail: 'the check in home-0000b001aaaa4aaa8aaa exited 124: timed out' });
  expect(noClone.state).toBe('unknown');
  expect(noImp).toStrictEqual({ state: 'unknown', detail: 'no imp ends with 0000d001aaaa4aaa8aaa' });
  expect(noFolder).toStrictEqual({ state: 'unknown', detail: 'atc gave no working directory for the session' });
});

test('an uncommitted change in a second worktree whose path holds a space is unpushed work', async () => {
  const app = setupTest('local');
  const tree = join(app.clone, '..', 'kettle spout');
  app.git(['-C', app.clone, 'worktree', 'add', '-q', '-b', 'spout', tree]);
  writeFileSync(join(tree, 'spout.ts'), 'export const spout = 1;\n');

  const work = await readImpWork(app.run, app.session, app.clone);

  expect(work).toStrictEqual({ state: 'unpushed', detail: `home-0000b001aaaa4aaa8aaa: ${tree}: ?? spout.ts` });
});

test('a worktree whose status check fails gives no answer, even when every other check passes', async () => {
  const app = setupTest('local');
  const tree = join(app.clone, '..', 'kettle-handle');
  app.git(['-C', app.clone, 'worktree', 'add', '-q', '-b', 'handle', tree]);
  rmSync(tree, { recursive: true, force: true });

  const work = await readImpWork(app.run, app.session, app.clone);

  expect(work.state).toBe('unknown');
});
