import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPushedClone, runGit } from '../../test/helpers.ts';
import { realRunner } from '../runner/real-runner.ts';
import { readLocalWork } from './read-local-work.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-local-work-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return { directory };
}

test('it finds all work pushed in a clone with every commit pushed and nothing uncommitted', async () => {
  const ctx = setupTest();
  const clone = createPushedClone(ctx.directory, 'kettle');

  const work = await readLocalWork(realRunner, clone);

  expect(work).toStrictEqual({ state: 'pushed' });
});

test('it finds an unpushed commit to be unpushed work', async () => {
  const ctx = setupTest();
  const clone = createPushedClone(ctx.directory, 'kettle');
  runGit(clone, 'commit', '-q', '--allow-empty', '-m', 'add spout');

  const work = await readLocalWork(realRunner, clone);

  expect(work.state).toBe('unpushed');
});

test('it finds an uncommitted change to be unpushed work', async () => {
  const ctx = setupTest();
  const clone = createPushedClone(ctx.directory, 'kettle');
  writeFileSync(join(clone, 'spout.ts'), 'export const spout = 1;\n');

  const work = await readLocalWork(realRunner, clone);

  expect(work).toMatchObject({ state: 'unpushed', detail: expect.stringContaining('spout.ts') });
});

test('it finds a removed working directory to hold no work', async () => {
  const ctx = setupTest();

  const work = await readLocalWork(realRunner, join(ctx.directory, 'missing'));

  expect(work).toStrictEqual({ state: 'pushed' });
});

test.skipIf(process.getuid?.() === 0)('it gives no answer when a parent of the working directory cannot be searched', async () => {
  const ctx = setupTest();
  const locked = join(ctx.directory, 'locked');
  mkdirSync(locked, { mode: 0o600 });

  const work = await readLocalWork(realRunner, join(locked, 'kettle'));

  expect(work.state).toBe('unknown');
});

test('it gives no answer for an exit 3 without the removed-directory marker', async () => {
  const run = () => Promise.resolve({ code: 3, stdout: '', stderr: 'boom\n' });

  const work = await readLocalWork(run, '/workspace/kettle');

  expect(work).toStrictEqual({ state: 'unknown', detail: 'the check in /workspace/kettle exited 3: boom' });
});

test('it gives no answer when the check fails in a folder that is no clone', async () => {
  const ctx = setupTest();

  const work = await readLocalWork(realRunner, ctx.directory);

  expect(work.state).toBe('unknown');
});

test.each(['.scratch', '.worktrees'])('it finds an untracked %s folder to be no work', async (folder) => {
  const ctx = setupTest();
  const clone = createPushedClone(ctx.directory, 'kettle');
  mkdirSync(join(clone, folder));
  writeFileSync(join(clone, folder, 'note.txt'), 'invented note\n');

  const work = await readLocalWork(realRunner, clone);

  expect(work).toStrictEqual({ state: 'pushed' });
});

test('it finds an untracked .scratch folder to be no work when git lists every untracked file', async () => {
  const ctx = setupTest();
  const clone = createPushedClone(ctx.directory, 'kettle');
  runGit(clone, 'config', 'status.showUntrackedFiles', 'all');
  mkdirSync(join(clone, '.scratch'));
  writeFileSync(join(clone, '.scratch', 'note.txt'), 'invented note\n');

  const work = await readLocalWork(realRunner, clone);

  expect(work).toStrictEqual({ state: 'pushed' });
});

test('it finds an untracked file beside an untracked .scratch folder to be unpushed work', async () => {
  const ctx = setupTest();
  const clone = createPushedClone(ctx.directory, 'kettle');
  mkdirSync(join(clone, '.scratch'));
  writeFileSync(join(clone, '.scratch', 'note.txt'), 'invented note\n');
  writeFileSync(join(clone, 'spout.ts'), 'export const spout = 1;\n');

  const work = await readLocalWork(realRunner, clone);

  expect(work).toStrictEqual({ state: 'unpushed', detail: `${clone}: ${clone}: ?? spout.ts` });
});

test('it finds a tracked change inside .scratch to be unpushed work', async () => {
  const ctx = setupTest();
  const clone = createPushedClone(ctx.directory, 'kettle');
  mkdirSync(join(clone, '.scratch'));
  writeFileSync(join(clone, '.scratch', 'note.txt'), 'invented note\n');
  runGit(clone, 'add', '-f', '.scratch/note.txt');
  runGit(clone, 'commit', '-q', '-m', 'add note');
  runGit(clone, 'push', '-q', 'origin', 'main');
  writeFileSync(join(clone, '.scratch', 'note.txt'), 'changed note\n');

  const work = await readLocalWork(realRunner, clone);

  expect(work.state).toBe('unpushed');
});

test('it finds an uncommitted change in a worktree under .worktrees to be unpushed work', async () => {
  const ctx = setupTest();
  const clone = createPushedClone(ctx.directory, 'kettle');
  runGit(clone, 'worktree', 'add', '-q', '.worktrees/spout', '-b', 'spout');
  runGit(clone, 'push', '-q', 'origin', 'spout');
  writeFileSync(join(clone, '.worktrees', 'spout', 'spout.ts'), 'export const spout = 1;\n');

  const work = await readLocalWork(realRunner, clone);

  expect(work).toMatchObject({ state: 'unpushed', detail: expect.stringContaining('spout.ts') });
});

test('it finds an unpushed commit in a worktree under .worktrees to be unpushed work', async () => {
  const ctx = setupTest();
  const clone = createPushedClone(ctx.directory, 'kettle');
  runGit(clone, 'worktree', 'add', '-q', '.worktrees/spout', '-b', 'spout');
  runGit(join(clone, '.worktrees', 'spout'), 'commit', '-q', '--allow-empty', '-m', 'add spout');

  const work = await readLocalWork(realRunner, clone);

  expect(work).toMatchObject({ state: 'unpushed', detail: expect.stringContaining('add spout') });
});

test('it gives no answer for a session with no working directory', async () => {
  const work = await readLocalWork(realRunner, null);

  expect(work).toMatchObject({ state: 'unknown' });
});
