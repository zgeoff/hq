import type { Database } from 'bun:sqlite';
import type { RekeyCount } from './read-rekey-counts.ts';
import type { RekeyStore } from './rekey-specs.ts';

// One database's side of an archive-history run.
export interface ArchiveSide {
  collisions: string[];
  counts: RekeyCount[];
  store: RekeyStore;
}

export interface ArchiveHistory {
  // The sides after the re-key; for a dry run, what they would hold.
  after: ArchiveSide[];
  backups: string[];
  before: ArchiveSide[];
  dryRun: boolean;
  from: string;

  // The review files the re-key moves, or for a dry run would move.
  reviewFiles: ReviewMove[];
  to: string;
}

// One review file of the repo being left, where the re-key puts it, and whether a file is there already.
export interface ReviewMove {
  collides: boolean;
  from: string;
  to: string;
}

// A checked copy of a database file beside it, named for `label` and `stamp`; returns its path.
export type CreateBackup = (file: string, label: string, stamp: string) => string;

// bun:sqlite's own options: read-only for a count, and its default read-write open for a re-key.
type OpenStoreOptions = { readonly: true } | { create: true };

export type OpenStore = (file: string, options: OpenStoreOptions) => Database;
