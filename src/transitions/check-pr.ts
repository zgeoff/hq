import { HqError } from '../errors.ts';
import { prAllows } from './pr-allows.ts';
import type { PrState } from './pr-states.ts';
import type { PrAction } from './pr-transitions.ts';

export function checkPr(ref: string, action: PrAction, from: PrState): void {
  if (prAllows(action, from)) return;
  throw new HqError('bad_state', action === 'unmerge' ? `${ref} is ${from}, not merged` : `${ref} is ${from}`, { state: from });
}
