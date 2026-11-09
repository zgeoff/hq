import { Database } from 'bun:sqlite';
import { join } from 'node:path';
import { createStagingHolderTable, writeStagingHolder } from '../write-staging-holder.ts';

interface StagingLockDeps {
  backupDir: string;
}

interface StagingLockInput {
  pid: number;
}

export function seedStagingLock(deps: StagingLockDeps, input: StagingLockInput): Database {
  const lock = new Database(join(deps.backupDir, 'staging-lock.sqlite'), { create: true });

  createStagingHolderTable(lock);
  writeStagingHolder(lock, input.pid);

  return lock;
}
