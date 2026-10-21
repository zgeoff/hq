import type { Database } from 'bun:sqlite';
import { readRekeyCollisions } from './read-rekey-collisions.ts';
import { readRekeyCounts } from './read-rekey-counts.ts';
import type { RekeyStore, RepoNames } from './rekey-specs.ts';
import { REKEY_SPECS } from './rekey-specs.ts';
import type { ArchiveSide } from './types.ts';

export function readArchiveSide(db: Database, store: RekeyStore, names: RepoNames): ArchiveSide {
  return {
    store,
    counts: readRekeyCounts(db, REKEY_SPECS[store], names),
    collisions: readRekeyCollisions(db, REKEY_SPECS[store], names),
  };
}
