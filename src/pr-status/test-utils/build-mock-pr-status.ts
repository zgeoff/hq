import type { PRStatusFields } from '../upsert-pr-status.ts';

export interface PRStatusInput extends PRStatusFields {
  repo: string;
  pr: number;
}

export function buildMockPRStatus(overrides: Partial<PRStatusInput> = {}): PRStatusInput {
  return { repo: 'widgets', pr: 7, head: '0123456789abcdef0123456789abcdef01234567', ...overrides };
}
