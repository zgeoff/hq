import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { boundedRunner } from '../runner/bounded-runner.ts';
import type { Runner } from '../runner/types.ts';
import { buildNoslopCommand } from './build-noslop-command.ts';
import { countStoreRows } from './count-store-rows.ts';
import { createStoreBackup } from './create-store-backup.ts';
import { pickMigrationProblem } from './pick-migration-problem.ts';
import { readCloneMigrations } from './read-clone-migrations.ts';
import { readStoreMigrations } from './read-store-migrations.ts';

interface TableCount {
  table: string;
  before: number;
  after: number;
}

// backup is null when nothing was migrated: no store file, or no migration the store lacks.
export interface StoreMigration {
  store: string;
  hasStore: boolean;
  names: string[];
  backup: string | null;
  tables: TableCount[];
}

export interface StoreMigrationInput {
  run: Runner;
  store: string;
  clone: string;
  sha: string;

  // Called after the backup and before the store query; it throws to stop the migration.
  requireIdle?: (() => Promise<void>) | undefined;
}

const MIGRATION_QUERY = ['store', 'query', 'findings-by-pr', '--repo', 'hq-pin-guard/none', '--pr', '1', '--json'],
  QUERY_TIMEOUT_MS = 300_000,
  SHORT_SHA_CHARS = 7;

// Applies the migrations the new noslop holds and the store lacks, by opening the store with it, and
// proves nothing was lost: a backup first, then every table counted before and after. It refuses
// when a count drops or a migration is missing after, and the store is then left for a restore.
export async function runStoreMigration(input: StoreMigrationInput): Promise<StoreMigration> {
  const none: StoreMigration = { store: input.store, hasStore: existsSync(input.store), names: [], backup: null, tables: [] };
  if (!none.hasStore) {
    return none;
  }
  return await runNewMigrations(input, none);
}

async function runNewMigrations(input: StoreMigrationInput, none: StoreMigration): Promise<StoreMigration> {
  const held = new Set(readStoreMigrations(input.store)),
    names = readCloneMigrations(input.clone).filter((name) => !held.has(name));
  if (names.length === 0) {
    return none;
  }
  return await applyMigrations(input, { ...none, names });
}

async function applyMigrations(input: StoreMigrationInput, pending: StoreMigration): Promise<StoreMigration> {
  const backup = createStoreBackup(input.store, input.sha.slice(0, SHORT_SHA_CHARS), iso(now()).replaceAll(/[-:]/gu, ''));
  await requireIdleAfterBackup(input, backup);
  try {
    const before = countStoreRows(input.store);
    await runMigrationQuery(input.run, input.clone);
    return { ...pending, backup, tables: checkMigrated(input.store, pending.names, before) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new HqError('store_migration_failed', `${reason}\nThe pin was not recorded. The store may have changed; the backup is ${backup}. To restore it: stop noslop, remove ${input.store}-wal and ${input.store}-shm, then cp ${backup} ${input.store}`, { backup, names: pending.names });
  }
}

async function requireIdleAfterBackup(input: StoreMigrationInput, backup: string): Promise<void> {
  try {
    await input.requireIdle?.();
  } catch (error) {
    rmSync(backup, { force: true });
    throw error;
  }
}

async function runMigrationQuery(run: Runner, clone: string): Promise<void> {
  const cwd = mkdtempSync(join(tmpdir(), 'hq-noslop-migrate-'));
  try {
    const result = await boundedRunner(run, QUERY_TIMEOUT_MS)(buildNoslopCommand(clone, MIGRATION_QUERY), { cwd });
    if (result.code !== 0) {
      throw new HqError('store_migration_failed', `the store query that applies the migrations failed (${result.code}): ${(result.stderr || result.stdout).trim().slice(-300)}`);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function checkMigrated(store: string, names: string[], before: Record<string, number>): TableCount[] {
  const after = countStoreRows(store),
    problem = pickMigrationProblem(names, readStoreMigrations(store), before, after);
  if (problem !== null) {
    throw new HqError('store_migration_failed', problem);
  }
  return buildTableCounts(before, after);
}

function buildTableCounts(before: Record<string, number>, after: Record<string, number>): TableCount[] {
  const added = Object.keys(after).filter((table) => !(table in before)),
    tables = [...Object.keys(before), ...added];
  return tables.map((table) => ({ table, before: before[table] ?? 0, after: after[table] ?? 0 }));
}
