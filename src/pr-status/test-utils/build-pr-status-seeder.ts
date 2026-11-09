import { seedPRStatus } from './seed-pr-status.ts';
import type { PRStatusDeps } from './types.ts';

export function buildPRStatusSeeder(deps: PRStatusDeps) {
  return {
    prStatus: (input?: Parameters<typeof seedPRStatus>[1]) => seedPRStatus(deps, input),
  };
}
