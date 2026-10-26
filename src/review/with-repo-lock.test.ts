import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { overrideEnv } from '../config/override-env.ts';
import { withRepoLock } from './with-repo-lock.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-repo-lock-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  onTestFinished(overrideEnv('HQ_REVIEW_LOCK_WAIT_MS', '0'));
  return {
    directory,
    lock: join(directory, '.lock-zgeoff-widgets'),

    // A waiter's work: it runs only if the waiter gets the lock.
    takeIt: () => Promise.resolve('took it'),

    // Polls the clock until it passes the given time, so a lock's age is past a waiter's 1 ms staleMs.
    waitUntilPast: async (time: number) => {
      while (Date.now() <= time) {
        await Bun.sleep(1);
      }
    },
  };
}

test('the holder stamps its lock with the time the lock goes stale', async () => {
  const ctx = setupTest();
  const before = Date.now();

  const stamped = await withRepoLock(ctx.directory, 'zgeoff/widgets', () => Promise.resolve(statSync(ctx.lock).mtimeMs), 2_400_000);

  expect(stamped).toBeGreaterThanOrEqual(before + 2_400_000 - 1000);
  expect(stamped).toBeLessThanOrEqual(Date.now() + 2_400_000 + 1000);
});

test('a waiter with a shorter staleMs leaves a live lock that its holder gave a longer one', async () => {
  const ctx = setupTest();

  const waited = await withRepoLock(
    ctx.directory,
    'zgeoff/widgets',
    async () => {
      await ctx.waitUntilPast(Date.now() + 5);
      return await withRepoLock(ctx.directory, 'zgeoff/widgets', ctx.takeIt, 1).catch((error: unknown) => error);
    },
    2_400_000,
  );

  expect(waited).toMatchObject({ code: 'locked' });
});

test('a waiter takes over a lock past the time its holder stamped', async () => {
  const ctx = setupTest();
  mkdirSync(ctx.lock);
  const wentStale = new Date(Date.now() - 2 * 60_000);
  utimesSync(ctx.lock, wentStale, wentStale);

  await expect(withRepoLock(ctx.directory, 'zgeoff/widgets', () => Promise.resolve('took it'))).resolves.toBe('took it');
});
