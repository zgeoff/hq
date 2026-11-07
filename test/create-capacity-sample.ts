import type { Database } from 'bun:sqlite';

export interface CapacitySampleSeed {
  at: string;
  nonnixAwakeMib: number | null;

  nonnixAwakeVcpus?: number | null;
  nixAwakeMib?: number;
  impdBudgetMib?: number;
  impdPriorityKeptMib?: number | null;
}

export function createCapacitySample(db: Database, ...samples: CapacitySampleSeed[]): Database {
  const insert = db.query('INSERT OR REPLACE INTO capacity_samples (at, nonnix_awake_mib, nonnix_awake_vcpus, nix_awake_mib, impd_budget_mib, impd_priority_kept_mib) VALUES (?, ?, ?, ?, ?, ?)');
  for (const sample of samples) {
    const vcpus = sample.nonnixAwakeVcpus === undefined ? 0 : sample.nonnixAwakeVcpus;
    insert.run(sample.at, sample.nonnixAwakeMib, vcpus, sample.nixAwakeMib ?? null, sample.impdBudgetMib ?? null, sample.impdPriorityKeptMib ?? null);
  }
  return db;
}
