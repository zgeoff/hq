import { seedRefusal } from './seed-refusal.ts';
import { seedRefusalFile } from './seed-refusal-file.ts';
import type { RefusalsDeps } from './types.ts';

export function buildRefusalsSeeder(deps: RefusalsDeps) {
  return {
    refusal: (input?: Parameters<typeof seedRefusal>[1]) => seedRefusal(deps, input),
    refusalFile: (input?: Parameters<typeof seedRefusalFile>[1]) => seedRefusalFile(deps, input),
  };
}
