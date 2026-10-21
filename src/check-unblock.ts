import { HqError } from './errors.ts';
import type { UnblockState } from './unblock-state.ts';
import type { UnblockAction } from './unblock-transitions.ts';
import { UNBLOCK_TRANSITIONS } from './unblock-transitions.ts';

// Refuses an unblock move its table lacks, as `<id> is done, not open`.
export function checkUnblock(id: string, action: UnblockAction, from: UnblockState): void {
  const allowed: readonly UnblockState[] = UNBLOCK_TRANSITIONS[action].from;
  if (!allowed.includes(from)) {
    throw new HqError('bad_state', `${id} is ${from}, not ${allowed.join(' or ')}`, { state: from });
  }
}
