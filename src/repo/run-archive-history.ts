import type { Database } from 'bun:sqlite';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { readNoslopProcesses } from '../noslop/read-noslop-processes.ts';
import type { Runner } from '../runner/types.ts';
import { buildExpectedSide } from './build-expected-side.ts';
import { checkArchiveNames } from './check-archive-names.ts';
import { readArchiveSide } from './read-archive-side.ts';
import type { RepoNames } from './rekey-specs.ts';
import { REKEY_SPECS } from './rekey-specs.ts';
import { runRekey } from './run-rekey.ts';
import type { ArchiveHistory, ArchiveSide, CreateBackup, OpenStore } from './types.ts';

export interface ArchiveInput {
  actor: string;
  createBackup: CreateBackup;
  db: Database;

  // The file `db` was opened from, which the backup copies.
  dbFile: string;
  dryRun: boolean;
  from: string;
  openStore: OpenStore;
  run: Runner;

  // noslop's store file; it may not exist.
  store: string;
  to: string;
}

// Moves the history of one repo name to another in hq.db and in noslop's store: the rows that name
// the repo, and nothing else. A refused run and a dry run change nothing and write no backup.
export async function runArchiveHistory(input: ArchiveInput): Promise<ArchiveHistory> {
  checkArchiveNames(input.from, input.to);
  const before = readSides(input, { from: input.from, to: input.to });
  requireHistory(before, input.from);
  if (input.dryRun) {
    return { dryRun: true, from: input.from, to: input.to, before, after: before.map((side) => buildExpectedSide(side)), backups: [] };
  }
  requireNoCollisions(before);
  await requireNoslopQuiet(input.run);
  return applyArchive(input, before);
}

function readSides(input: ArchiveInput, names: RepoNames): ArchiveSide[] {
  const hq = readArchiveSide(input.db, 'hq', names);
  return existsSync(input.store) ? [hq, readStoreSide(input, names)] : [hq];
}

function readStoreSide(input: ArchiveInput, names: RepoNames): ArchiveSide {
  const store = input.openStore(input.store, { readonly: true });
  try {
    return readArchiveSide(store, 'noslop', names);
  } finally {
    store.close();
  }
}

function requireHistory(sides: ArchiveSide[], from: string): void {
  const rows = sides.flatMap((side) => side.counts).reduce((total, count) => total + count.from, 0);
  if (rows === 0) {
    throw new HqError('nothing_to_rekey', `no row in hq.db or in noslop's store names ${from}: nothing to re-key`);
  }
}

function requireNoCollisions(sides: ArchiveSide[]): void {
  const keys = sides.flatMap((side) => side.collisions.map((key) => `${side.store === 'hq' ? 'hq.db' : 'noslop store'}: ${key}`));
  if (keys.length > 0) {
    throw new HqError('rekey_collision', `${keys.length} row(s) would repeat a key after the re-key; nothing changed:\n${keys.map((key) => `  ${key}`).join('\n')}`, { keys });
  }
}

async function requireNoslopQuiet(run: Runner): Promise<void> {
  const processes = await readNoslopProcesses(run);
  if (processes.length > 0) {
    throw new HqError('noslop_busy', `noslop is running, so its store cannot be re-keyed:\n${processes.map((found) => `  process ${found.pid}: ${found.command}`).join('\n')}\nWait for it to end.`, { processes });
  }
}

function createArchiveBackups(input: ArchiveInput): string[] {
  const files = existsSync(input.store) ? [input.dbFile, input.store] : [input.dbFile],
    stamp = `${iso(now()).replaceAll(/[-:]/gu, '')}-${randomBytes(2).toString('hex')}`;
  return files.map((file) => input.createBackup(file, 'archive', stamp));
}

function applyArchive(input: ArchiveInput, before: ArchiveSide[]): ArchiveHistory {
  const backups = createArchiveBackups(input);
  runRekeys(input, before, backups);
  return writeArchiveRecord(input, before, backups);
}

function runRekeys(input: ArchiveInput, before: ArchiveSide[], backups: string[]): void {
  runRekey(input.db, REKEY_SPECS.hq, { from: input.from, to: input.to });
  if (before.some((side) => side.store === 'noslop')) {
    runStoreRekey(input, { from: input.from, to: input.to }, backups);
  }
}

function writeArchiveRecord(input: ArchiveInput, before: ArchiveSide[], backups: string[]): ArchiveHistory {
  const after = readSides(input, { from: input.from, to: input.to });
  logEvent(input.db, 'hq', 'repo', 'archive-history', input.actor, input.from, input.to, { backups, rows: after.flatMap((side) => side.counts) });
  return { dryRun: false, from: input.from, to: input.to, before, after, backups };
}

function runStoreRekey(input: ArchiveInput, names: RepoNames, backups: string[]): void {
  const store = input.openStore(input.store, { create: true });
  try {
    runRekey(store, REKEY_SPECS.noslop, names);
  } catch (error) {
    throw new HqError('rekey_partial', `hq.db was re-keyed but noslop's store was not (${error instanceof Error ? error.message : String(error)}). The backups are ${backups.join(' and ')}.`, { backups });
  } finally {
    store.close();
  }
}
