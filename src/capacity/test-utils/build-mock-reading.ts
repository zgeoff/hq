import type { Reading } from '../types.ts';

// A field left out reads as a working impd's, with a 1 TiB budget that no test's line reaches.
export function buildMockReading(overrides: Partial<Reading> = {}): Reading {
  return {
    at: '2026-10-14T00:55:00Z',
    impd_budget_mib: 1_048_576,
    impd_used_mib: null,
    impd_committed_mib: null,
    impd_priority_kept_mib: 0,
    nonnix_awake_mib: null,
    nonnix_awake_vcpus: 0,
    nix_awake_mib: 0,
    cloud_avail_bytes: null,
    cloud_total_bytes: null,
    claude_account: null,
    claude_five_hour: null,
    claude_seven_day: null,
    claude_at: null,
    claude_five_hour_resets_at: null,
    claude_seven_day_resets_at: null,
    ci_minutes_today: null,
    pc_disk_free_bytes: null,
    pc_mem_avail_bytes: null,
    op_account_used: null,
    op_account_limit: null,
    op_refused: null,
    errors: {},
    ...overrides,
  };
}
