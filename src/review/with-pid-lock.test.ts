import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withPidLock } from './with-pid-lock.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-pid-lock-'));

  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));

  return { directory, lock: join(directory, '7.lock') };
}

test('it takes over the lock of a holder whose process is gone, and removes it after', async () => {
  const ctx = setupTest();
  const gone = Bun.spawnSync(['true']).pid;
  mkdirSync(ctx.lock);
  writeFileSync(join(ctx.lock, 'pid'), String(gone));

  const held = await withPidLock(ctx.lock, 'a review of zgeoff/widgets#7', () => Promise.resolve(readFileSync(join(ctx.lock, 'pid'), 'utf8')));

  expect(held).toBe(String(process.pid));
  expect(existsSync(ctx.lock)).toBe(false);
});

test('it refuses, and leaves the lock alone, while another takeover of a dead holder\'s lock runs', () => {
  const ctx = setupTest();
  const gone = Bun.spawnSync(['true']).pid;
  mkdirSync(ctx.lock);
  writeFileSync(join(ctx.lock, 'pid'), String(gone));
  mkdirSync(`${ctx.lock}.takeover`);

  expect(withPidLock(ctx.lock, 'a review of zgeoff/widgets#7', () => Promise.resolve('ran'))).rejects.toMatchObject({ code: 'locked' });
  expect(readFileSync(join(ctx.lock, 'pid'), 'utf8')).toBe(String(gone));
});

test('it never removes a lock that another process took over while this one held it', async () => {
  const ctx = setupTest();
  const sleeper = Bun.spawn(['sleep', '30']);
  onTestFinished(() => sleeper.kill());

  await withPidLock(ctx.lock, 'a review of zgeoff/widgets#7', () => {
    writeFileSync(join(ctx.lock, 'pid'), String(sleeper.pid));
    return Promise.resolve();
  });

  expect(readFileSync(join(ctx.lock, 'pid'), 'utf8')).toBe(String(sleeper.pid));
});

test('it waits for a holder in this process to let go, then takes the lock', async () => {
  const ctx = setupTest();
  const release = Promise.withResolvers<void>();
  const order: string[] = [];
  const first = withPidLock(ctx.lock, 'a pin', async () => {
    order.push('first in');
    await release.promise;
    order.push('first out');
  });

  const second = withPidLock(ctx.lock, 'a pin', () => Promise.resolve(order.push('second in')), 5000);
  release.resolve();
  await Promise.all([first, second]);

  expect(order).toStrictEqual(['first in', 'first out', 'second in']);
});

test('it keeps a lock whose holder still runs however old the lock is', () => {
  const ctx = setupTest();
  const sleeper = Bun.spawn(['sleep', '30']);
  onTestFinished(() => sleeper.kill());
  mkdirSync(ctx.lock);
  writeFileSync(join(ctx.lock, 'pid'), String(sleeper.pid));
  utimesSync(ctx.lock, new Date(Date.now() - 3_600_000), new Date(Date.now() - 3_600_000));

  expect(withPidLock(ctx.lock, 'a pin', () => Promise.resolve('ran'))).rejects.toMatchObject({ code: 'locked', message: expect.stringContaining(`a pin holds ${ctx.lock} (pid ${sleeper.pid})`) });
});
