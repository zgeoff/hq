import type { DeployRunRow } from '../write-deploy-run.ts';

export function buildMockDeployRun(overrides: Partial<DeployRunRow> = {}): DeployRunRow {
  return { run_id: 1, outcome: 'applied_ok', attempt: 1, apply_conclusion: null, failed_step: null, fetched_at: '2026-10-16T05:00:00Z', ...overrides };
}
