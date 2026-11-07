import type { Database } from 'bun:sqlite';

// A missing impd field holds every imp slot, so a field left out reads as a working impd's, with a
// 1 TiB budget that no test's line reaches.
export interface CapacitySampleSeed {
  at: string;
  nonnixAwakeMib: number | null;

  nonnixAwakeVcpus?: number | null;
  nixAwakeMib?: number | null;
  impdBudgetMib?: number | null;
  impdPriorityKeptMib?: number | null;
  impdCommittedMib?: number | null;
}

export function createCapacitySample(db: Database, ...samples: CapacitySampleSeed[]): Database {
  const insert = db.query('INSERT OR REPLACE INTO capacity_samples (at, nonnix_awake_mib, nonnix_awake_vcpus, nix_awake_mib, impd_budget_mib, impd_priority_kept_mib, impd_committed_mib) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const sample of samples) {
    const vcpus = sample.nonnixAwakeVcpus === undefined ? 0 : sample.nonnixAwakeVcpus;
    const nixMib = sample.nixAwakeMib === undefined ? 0 : sample.nixAwakeMib;
    const budgetMib = sample.impdBudgetMib === undefined ? 1_048_576 : sample.impdBudgetMib;
    const keptMib = sample.impdPriorityKeptMib === undefined ? 0 : sample.impdPriorityKeptMib;
    const committedMib = sample.impdCommittedMib === undefined ? null : sample.impdCommittedMib;
    insert.run(sample.at, sample.nonnixAwakeMib, vcpus, nixMib, budgetMib, keptMib, committedMib);
  }
  return db;
}
