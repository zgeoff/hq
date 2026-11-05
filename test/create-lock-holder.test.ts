import { expect, onTestFinished, test } from 'bun:test';
import { withFileLock } from '@zgeoff/std/with-file-lock';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLockHolder } from './create-lock-holder.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-lock-holder-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return { lock: join(directory, 'kettle.flock') };
}

test('it holds the lock in another process until it is killed', async () => {
  const ctx = setupTest();
  const holder = await createLockHolder(ctx.lock);
  onTestFinished(holder.kill);
  const whileHeld = await withFileLock(ctx.lock, () => Promise.resolve('boiled'));

  await holder.kill();
  const afterKill = await withFileLock(ctx.lock, () => Promise.resolve('boiled'));

  expect(whileHeld).toStrictEqual({ kind: 'busy', holder: expect.objectContaining({ pid: holder.pid }) });
  expect(afterKill).toStrictEqual({ kind: 'ran', value: 'boiled' });
});
