import { HqError } from '../errors.ts';
import type { RunState } from './run-states.ts';
import type { RunAction } from './run-transitions.ts';
import { RUN_TRANSITIONS } from './run-transitions.ts';
import type { Row } from './types.ts';

export function checkRun(id: string, action: RunAction, from: RunState, to: RunState): void {
  const row: Row<RunState> = RUN_TRANSITIONS[action];
  if (!row.from.includes(from)) {
    throw new HqError('bad_state', action === 'state' ? `${id} is ${from}: pass --reopen to change it` : `${id} is ${from}: ${action} needs ${row.from.join(' or ')}`, { state: from });
  }
  if (!targets(row, from).includes(to)) throw new HqError('bad_state', `${id} is ${from}: ${action} cannot go to ${to}`, { state: from });
}

function targets<S extends string>(row: Row<S>, from: S): readonly S[] {
  return row.to === 'same' ? [from] : typeof row.to === 'string' ? [row.to as S] : (row.to as readonly S[]);
}
