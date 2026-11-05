import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLockHolder } from '../../test/create-lock-holder.ts';
import { withExclusiveLock } from './with-exclusive-lock.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-exclusive-lock-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  return { lock: join(directory, '7.flock') };
}

test('it runs the callback and returns its value', () => {
  const ctx = setupTest();

  expect(withExclusiveLock(ctx.lock, 'a review of zgeoff/widgets#7', () => Promise.resolve('ran'))).resolves.toBe('ran');
});

test('it refuses with the holder\'s pid while another process holds the lock', async () => {
  const ctx = setupTest();
  const holder = await createLockHolder(ctx.lock);
  onTestFinished(holder.kill);

  expect(withExclusiveLock(ctx.lock, 'a pin', () => Promise.resolve('ran'))).rejects.toMatchObject({ code: 'locked', message: `a pin holds ${ctx.lock} (pid ${holder.pid}); wait for it to end` });
});

test('it takes the lock of a holder that was killed, with no wait', async () => {
  const ctx = setupTest();
  const holder = await createLockHolder(ctx.lock);
  await holder.kill();

  expect(withExclusiveLock(ctx.lock, 'a pin', () => Promise.resolve('ran'))).resolves.toBe('ran');
});

test('it runs while the lock file holds a record that no process holds', () => {
  const ctx = setupTest();
  writeFileSync(ctx.lock, JSON.stringify({ pid: 999_999, host: 'kettle', token: 'stale', acquiredAt: '2026-01-01T00:00:00.000Z' }));

  expect(withExclusiveLock(ctx.lock, 'a pin', () => Promise.resolve('ran'))).resolves.toBe('ran');
});

test('it waits for a holder in this process to let go, then takes the lock', async () => {
  const ctx = setupTest();
  const release = Promise.withResolvers<void>();
  const order: string[] = [];
  const first = withExclusiveLock(ctx.lock, 'a pin', async () => {
    order.push('first in');
    await release.promise;
    order.push('first out');
  });

  const second = withExclusiveLock(ctx.lock, 'a pin', () => Promise.resolve(order.push('second in')), 5000);
  release.resolve();
  await Promise.all([first, second]);

  expect(order).toStrictEqual(['first in', 'first out', 'second in']);
});
