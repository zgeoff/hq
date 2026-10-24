import type { Database } from 'bun:sqlite';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import { readNoslopProcesses } from '../noslop/read-noslop-processes.ts';
import type { Runner } from '../runner/types.ts';
import { buildExpectedSide } from './build-expected-side.ts';
import { checkArchiveNames } from './check-archive-names.ts';
import { readArchiveSide } from './read-archive-side.ts';
import { readKnownRepos } from './read-known-repos.ts';
import { readReviewMoves } from './read-review-moves.ts';
import type { RepoNames } from './rekey-specs.ts';
import { REKEY_SPECS } from './rekey-specs.ts';
import { runRekey } from './run-rekey.ts';
import type { ArchiveHistory, ArchiveSide, CreateBackup, OpenStore, ReviewMove } from './types.ts';

export interface ArchiveInput {
  actor: string;
  createBackup: CreateBackup;
  db: Database;

  // The file `db` was opened from, which the backup copies.
  dbFile: string;
  dryRun: boolean;
  from: string;
  openStore: OpenStore;

  // The folder that holds the review files; it may not exist.
  reviewDir: string;
  run: Runner;

  // noslop's store file; it may not exist.
  store: string;
  to: string;
}

// Moves the history of one repo name to another in hq.db, in noslop's store and in the review
// folder: the rows that name the repo and its review files, and nothing else. A refused run and a
// dry run change nothing and write no backup.
export async function runArchiveHistory(input: ArchiveInput): Promise<ArchiveHistory> {
  checkArchiveNames(input.from, input.to);
  const before = readSides(input, { from: input.from, to: input.to });
  const reviewFiles = readReviewMoves(input.reviewDir, { from: input.from, to: input.to }, readKnownRepos(input.db));
  requireHistory(before, reviewFiles, input.from);
  requireOneOwner(reviewFiles);
  if (input.dryRun) {
    return { dryRun: true, from: input.from, to: input.to, before, after: before.map((side) => buildExpectedSide(side)), backups: [], reviewFiles };
  }
  requireNoCollisions(before, reviewFiles);
  await requireNoslopQuiet(input.run);
  return applyArchive(input, before, reviewFiles);
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

function requireHistory(sides: ArchiveSide[], reviewFiles: ReviewMove[], from: string): void {
  const rows = sides.flatMap((side) => side.counts).reduce((total, count) => total + count.from, 0);
  if (rows === 0 && reviewFiles.length === 0) {
    throw new HqError('nothing_to_rekey', `no row in hq.db or in noslop's store, and no review file, names ${from}: nothing to re-key`);
  }
}

function requireOneOwner(reviewFiles: ReviewMove[]): void {
  const shared = reviewFiles.filter((move) => move.otherOwners.length > 0).map((move) => `${move.from} (could also be ${move.otherOwners.join(', ')})`);
  if (shared.length > 0) {
    throw new HqError('rekey_ambiguous', `${shared.length} flat review file(s) could also belong to another repo, so hq cannot tell whose they are. Rename them by hand to the folder layout, <owner>/<repo>/<pr>-review.md, then run again; nothing changed:\n${shared.map((line) => `  ${line}`).join('\n')}`, { files: shared });
  }
}

function requireNoCollisions(sides: ArchiveSide[], reviewFiles: ReviewMove[]): void {
  const rows = sides.flatMap((side) => side.collisions.map((key) => `${side.store === 'hq' ? 'hq.db' : 'noslop store'}: ${key}`));
  const files = reviewFiles.filter((move) => move.collides).map((move) => `review file: ${move.to}`);
  const keys = [...rows, ...files];
  if (keys.length > 0) {
    throw new HqError('rekey_collision', `${keys.length} row(s) or file(s) would repeat a key after the re-key; nothing changed:\n${keys.map((key) => `  ${key}`).join('\n')}`, { keys });
  }
}

async function requireNoslopQuiet(run: Runner): Promise<void> {
  const processes = await readNoslopProcesses(run);
  if (processes.length > 0) {
    throw new HqError('noslop_busy', `noslop is running, so its store cannot be re-keyed:\n${processes.map((found) => `  process ${found.pid}: ${found.command}`).join('\n')}\nWait for it to end.`, { processes });
  }
}

function applyArchive(input: ArchiveInput, before: ArchiveSide[], reviewFiles: ReviewMove[]): ArchiveHistory {
  const backups = createArchiveBackups(input);
  runRekeys(input, before, backups);
  writeReviewMoves(input, reviewFiles, backups);
  return writeArchiveRecord(input, before, { backups, reviewFiles });
}

function createArchiveBackups(input: ArchiveInput): string[] {
  const files = existsSync(input.store) ? [input.dbFile, input.store] : [input.dbFile],
    stamp = `${iso(now()).replaceAll(/[-:]/gu, '')}-${randomBytes(2).toString('hex')}`;
  return files.map((file) => input.createBackup(file, 'archive', stamp));
}

function runRekeys(input: ArchiveInput, before: ArchiveSide[], backups: string[]): void {
  runRekey(input.db, REKEY_SPECS.hq, { from: input.from, to: input.to });
  if (before.some((side) => side.store === 'noslop')) {
    runStoreRekey(input, { from: input.from, to: input.to }, backups);
  }
}

function runStoreRekey(input: ArchiveInput, names: RepoNames, backups: string[]): void {
  let store: Database | null = null;
  try {
    store = input.openStore(input.store, { create: true });
    runRekey(store, REKEY_SPECS.noslop, names);
  } catch (error) {
    throw new HqError('rekey_partial', `hq.db was re-keyed but noslop's store was not (${error instanceof Error ? error.message : String(error)}). The backups are ${backups.join(' and ')}.`, { backups });
  } finally {
    store?.close();
  }
}

function writeReviewMoves(input: ArchiveInput, reviewFiles: ReviewMove[], backups: string[]): void {
  try {
    for (const move of reviewFiles) {
      mkdirSync(dirname(move.to), { recursive: true });
      renameSync(move.from, move.to);
    }
    removeEmptyReviewFolder(join(input.reviewDir, 'zgeoff', input.from.toLowerCase()));
  } catch (error) {
    throw new HqError('rekey_partial', `hq.db and noslop's store were re-keyed but the review files were not all moved (${error instanceof Error ? error.message : String(error)}). The backups are ${backups.join(' and ')}.`, { backups });
  }
}

function removeEmptyReviewFolder(folder: string): void {
  const holdsFile = existsSync(folder) && readdirSync(folder, { recursive: true, withFileTypes: true }).some((entry) => !entry.isDirectory());
  if (existsSync(folder) && !holdsFile) {
    rmSync(folder, { recursive: true });
  }
}

interface ArchiveWrites {
  backups: string[];
  reviewFiles: ReviewMove[];
}

function writeArchiveRecord(input: ArchiveInput, before: ArchiveSide[], writes: ArchiveWrites): ArchiveHistory {
  const after = readSides(input, { from: input.from, to: input.to });
  logEvent(input.db, 'hq', 'repo', 'archive-history', input.actor, input.from, input.to, { backups: writes.backups, rows: after.flatMap((side) => side.counts), reviewFiles: writes.reviewFiles.map((move) => ({ from: move.from, to: move.to })) });
  return { dryRun: false, from: input.from, to: input.to, before, after, backups: writes.backups, reviewFiles: writes.reviewFiles };
}
