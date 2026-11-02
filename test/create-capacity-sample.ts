import type { Database } from 'bun:sqlite';

export interface CapacitySampleSeed {
  at: string;
  nonnixAwakeMib: number | null;

  nonnixAwakeVcpus?: number | null;
}

export function createCapacitySample(db: Database, ...samples: CapacitySampleSeed[]): Database {
  const insert = db.query('INSERT OR REPLACE INTO capacity_samples (at, nonnix_awake_mib, nonnix_awake_vcpus) VALUES (?, ?, ?)');
  for (const sample of samples) {
    const vcpus = sample.nonnixAwakeVcpus === undefined ? 0 : sample.nonnixAwakeVcpus;
    insert.run(sample.at, sample.nonnixAwakeMib, vcpus);
  }
  return db;
}
