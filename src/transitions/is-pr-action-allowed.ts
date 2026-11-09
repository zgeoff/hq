import { isOneOf } from '@zgeoff/std';
import type { PRState } from './pr-states.ts';
import type { PRAction } from './pr-transitions.ts';
import { PR_TRANSITIONS } from './pr-transitions.ts';

export function isPRActionAllowed(action: PRAction, from: PRState): boolean {
  return isOneOf(from, PR_TRANSITIONS[action].from);
}
