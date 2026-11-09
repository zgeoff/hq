import { HqError } from '../errors.ts';
import type { PRState } from './types.ts';

export function buildShippedPR(state: PRState | undefined): { ref: string; tag: string | null; shipped_at: string } {
  if (!state?.at) {
    throw new HqError('bad_state', 'a PR counted as shipped has no shipped time');
  }
  return { ref: state.ref, tag: state.tag, shipped_at: state.at };
}
