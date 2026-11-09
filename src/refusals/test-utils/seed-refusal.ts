import invariant from 'tiny-invariant';
import type { RefusalInput } from '../write-refusal.ts';
import { writeRefusal } from '../write-refusal.ts';
import { buildMockRefusal } from './build-mock-refusal.ts';
import type { RefusalsDeps } from './types.ts';

export function seedRefusal(deps: RefusalsDeps, input: Partial<RefusalInput> = {}): RefusalInput {
  const refusal = buildMockRefusal(input);
  invariant(writeRefusal(deps.db, refusal));

  return refusal;
}
