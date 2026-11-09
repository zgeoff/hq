import type { ClosedPRRow } from '../write-closed-pr.ts';

export function buildMockClosedPR(overrides: Partial<ClosedPRRow> = {}): ClosedPRRow {
  return { repo: 'atc', number: 1, closed_at: '2026-10-15T03:00:00Z', ...overrides };
}
