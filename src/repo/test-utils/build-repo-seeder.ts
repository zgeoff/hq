import { seedDisposition } from './seed-disposition.ts';
import { seedNoslopReview } from './seed-noslop-review.ts';
import type { RepoDeps } from './types.ts';

export function buildRepoSeeder(deps: RepoDeps) {
  return {
    disposition: (input?: Parameters<typeof seedDisposition>[1]) => seedDisposition(deps, input),
    noslopReview: (input?: Parameters<typeof seedNoslopReview>[1]) => seedNoslopReview(deps, input),
  };
}
