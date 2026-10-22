import { HqError } from '../errors.ts';
import type { AskState } from './ask-states.ts';
import type { AskAction } from './ask-transitions.ts';
import { ASK_TRANSITIONS } from './ask-transitions.ts';

export function checkAsk(id: string, action: AskAction, from: AskState): void {
  const allowed: readonly AskState[] = ASK_TRANSITIONS[action].from;
  if (!allowed.includes(from)) throw new HqError('bad_state', `${id} is ${from}: ${action} needs ${allowed.join(' or ')}`, { state: from });
}
