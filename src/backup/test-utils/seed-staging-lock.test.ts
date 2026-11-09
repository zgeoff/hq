import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedStagingLock } from './seed-staging-lock.ts';

function setupTest() {
  const backupDir = mkdtempSync(join(tmpdir(), 'hq-staging-lock-'));
  onTestFinished(() => rmSync(backupDir, { recursive: true, force: true }));
  return { backupDir };
}

test('#seedStagingLock records the pid of the run that holds the staging dir', () => {
  const ctx = setupTest();

  const lock = seedStagingLock(ctx, { pid: 4242 });
  onTestFinished(() => lock.close());

  expect(lock.query('SELECT id, pid FROM holder').all()).toStrictEqual([{ id: 1, pid: 4242 }]);
});
