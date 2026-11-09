import { upsertPRStatus } from '../upsert-pr-status.ts';
import { buildMockPRStatus } from './build-mock-pr-status.ts';
import type { PRStatusInput } from './build-mock-pr-status.ts';
import type { PRStatusDeps } from './types.ts';

export function seedPRStatus(deps: PRStatusDeps, input: Partial<PRStatusInput> = {}): PRStatusInput {
  const status = buildMockPRStatus(input);
  const { repo, pr, ...fields } = status;
  upsertPRStatus(deps.db, repo, pr, fields);

  return status;
}
