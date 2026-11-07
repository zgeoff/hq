import { isOneOf } from '@zgeoff/std';
import type { PrState } from './pr-states.ts';
import type { PrAction } from './pr-transitions.ts';
import { PR_TRANSITIONS } from './pr-transitions.ts';

export function prAllows(action: PrAction, from: PrState): boolean {
  return isOneOf(from, PR_TRANSITIONS[action].from);
}
