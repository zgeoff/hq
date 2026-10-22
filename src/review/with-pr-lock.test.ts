import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withPRLock } from './with-pr-lock.ts';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'hq-pr-lock-'));

  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));

  return { directory, lock: join(directory, '7.lock') };
}

test('it takes over the lock of a holder whose process is gone, and removes it after', async () => {
  const ctx = setupTest();
  const gone = Bun.spawnSync(['true']).pid;
  mkdirSync(ctx.lock);
  writeFileSync(join(ctx.lock, 'pid'), String(gone));

  const held = await withPRLock(ctx.lock, 'zgeoff/widgets#7', () => Promise.resolve(readFileSync(join(ctx.lock, 'pid'), 'utf8')));

  expect(held).toBe(String(process.pid));
  expect(existsSync(ctx.lock)).toBe(false);
});

test('it refuses, and leaves the lock alone, while another takeover of a dead holder\'s lock runs', async () => {
  const ctx = setupTest();
  const gone = Bun.spawnSync(['true']).pid;
  mkdirSync(ctx.lock);
  writeFileSync(join(ctx.lock, 'pid'), String(gone));
  mkdirSync(`${ctx.lock}.takeover`);

  const refused = await withPRLock(ctx.lock, 'zgeoff/widgets#7', () => Promise.resolve('ran')).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toMatchObject({ code: 'locked' });
  expect(readFileSync(join(ctx.lock, 'pid'), 'utf8')).toBe(String(gone));
});

test('it never removes a lock that another process took over while this one held it', async () => {
  const ctx = setupTest();
  const sleeper = Bun.spawn(['sleep', '30']);
  onTestFinished(() => sleeper.kill());

  await withPRLock(ctx.lock, 'zgeoff/widgets#7', () => {
    writeFileSync(join(ctx.lock, 'pid'), String(sleeper.pid));
    return Promise.resolve();
  });

  expect(readFileSync(join(ctx.lock, 'pid'), 'utf8')).toBe(String(sleeper.pid));
});
