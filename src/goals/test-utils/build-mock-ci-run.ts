import type { CIRunRow } from '../write-ci-run.ts';

export function buildMockCIRun(overrides: Partial<CIRunRow> = {}): CIRunRow {
  return {
    id: 1,
    repo: 'atc',
    path: '.github/workflows/ci.yml',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
    attempt: 1,
    created_at: '2026-10-16T02:00:00Z',
    started_at: '2026-10-16T02:00:00Z',
    updated_at: '2026-10-16T02:10:00Z',
    ...overrides,
  };
}
