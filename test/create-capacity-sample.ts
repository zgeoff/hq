import type { Database } from 'bun:sqlite';

export interface CapacitySampleSeed {
  at: string;
  nonnixAwakeMib: number | null;

  // The awake non-Nix imps' vCPUs; left out, none are awake.
  nonnixAwakeVcpus?: number | null;
}

// Capacity samples as the watch writes them, in order, holding only the impd readings the lanes
// read: awake non-Nix MiB and vCPUs at `at`. A later sample at the same time replaces the earlier one.
export function createCapacitySample(db: Database, ...samples: CapacitySampleSeed[]): Database {
  const insert = db.query('INSERT OR REPLACE INTO capacity_samples (at, nonnix_awake_mib, nonnix_awake_vcpus) VALUES (?, ?, ?)');
  for (const sample of samples) {
    const vcpus = sample.nonnixAwakeVcpus === undefined ? 0 : sample.nonnixAwakeVcpus;
    insert.run(sample.at, sample.nonnixAwakeMib, vcpus);
  }
  return db;
}
