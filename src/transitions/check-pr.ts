import { HqError } from '../errors.ts';
import { isPRActionAllowed } from './is-pr-action-allowed.ts';
import type { PRState } from './pr-states.ts';
import type { PRAction } from './pr-transitions.ts';

export function checkPR(ref: string, action: PRAction, from: PRState): void {
  if (isPRActionAllowed(action, from)) {
    return;
  }
  throw new HqError('bad_state', action === 'unmerge' ? `${ref} is ${from}, not merged` : `${ref} is ${from}`, { state: from });
}
