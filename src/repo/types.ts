import type { Database } from 'bun:sqlite';
import type { RekeyCount } from './read-rekey-counts.ts';
import type { RekeyStore } from './rekey-specs.ts';

export interface ArchiveSide {
  collisions: string[];
  counts: RekeyCount[];
  store: RekeyStore;
}

export interface ArchiveHistory {
  after: ArchiveSide[];
  backups: string[];
  before: ArchiveSide[];
  dryRun: boolean;
  from: string;

  reviewFiles: ReviewMove[];
  to: string;
}

export interface ReviewMove {
  collides: boolean;
  from: string;
  to: string;
}

export type CreateBackup = (file: string, label: string, stamp: string) => string;

type OpenStoreOptions = { readonly: true } | { create: true };

export type OpenStore = (file: string, options: OpenStoreOptions) => Database;
