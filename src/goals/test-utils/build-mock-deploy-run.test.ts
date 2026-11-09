import { expect, test } from 'bun:test';
import { buildMockDeployRun } from './build-mock-deploy-run.ts';

test('it builds a default applied deploy run', () => {
  expect(buildMockDeployRun()).toStrictEqual({ run_id: 1, outcome: 'applied_ok', attempt: 1, apply_conclusion: null, failed_step: null, fetched_at: '2026-10-16T05:00:00Z' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockDeployRun({ outcome: 'held', failed_step: 'Hold for a manual dispatch' })).toStrictEqual({ run_id: 1, outcome: 'held', attempt: 1, apply_conclusion: null, failed_step: 'Hold for a manual dispatch', fetched_at: '2026-10-16T05:00:00Z' });
});
