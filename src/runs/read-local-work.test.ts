import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realRunner } from '../runner/real-runner.ts';
import { readLocalWork } from './read-local-work.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-local-work-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const git = (args: string[]) => Bun.spawnSync(['git', '-c', 'user.name=Kettle Bot', '-c', 'user.email=kettle@example.invalid', ...args], { cwd: directory, stdout: 'ignore', stderr: 'ignore' });
  const clone = join(directory, 'kettle');
  git(['init', '-q', '--bare', '-b', 'main', join(directory, 'remote.git')]);
  git(['clone', '-q', join(directory, 'remote.git'), clone]);
  writeFileSync(join(clone, 'lid.ts'), 'export const lid = 1;\n');
  git(['-C', clone, 'add', '.']);
  git(['-C', clone, 'commit', '-q', '-m', 'add kettle lid']);
  return { clone, git };
}

test('it finds all work pushed in a clone with every commit pushed and nothing uncommitted', async () => {
  const ctx = setupTest();
  ctx.git(['-C', ctx.clone, 'push', '-q', 'origin', 'main']);

  const work = await readLocalWork(realRunner, ctx.clone);

  expect(work).toStrictEqual({ state: 'pushed' });
});

test('it finds an unpushed commit to be unpushed work', async () => {
  const ctx = setupTest();

  const work = await readLocalWork(realRunner, ctx.clone);

  expect(work.state).toBe('unpushed');
});

test('it finds an uncommitted change to be unpushed work', async () => {
  const ctx = setupTest();
  ctx.git(['-C', ctx.clone, 'push', '-q', 'origin', 'main']);
  writeFileSync(join(ctx.clone, 'spout.ts'), 'export const spout = 1;\n');

  const work = await readLocalWork(realRunner, ctx.clone);

  expect(work).toMatchObject({ state: 'unpushed', detail: expect.stringContaining('spout.ts') });
});

test('it gives no answer when the check fails', async () => {
  const ctx = setupTest();

  const work = await readLocalWork(realRunner, join(ctx.clone, 'missing'));

  expect(work.state).toBe('unknown');
});

test('it gives no answer for a session with no working directory', async () => {
  const work = await readLocalWork(realRunner, null);

  expect(work).toMatchObject({ state: 'unknown' });
});
