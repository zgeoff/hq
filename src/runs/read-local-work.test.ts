import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

test('it gives no answer when the check fails', async () => {
  const ctx = setupTest();

  const work = await readLocalWork(realRunner, join(ctx.directory, 'missing'));

  expect(work.state).toBe('unknown');
});

test('it gives no answer for a session with no working directory', async () => {
  const work = await readLocalWork(realRunner, null);

  expect(work).toMatchObject({ state: 'unknown' });
});
