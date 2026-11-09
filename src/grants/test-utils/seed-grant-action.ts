import type { GrantAction, GrantActionInput } from '../types.ts';
import { recordGrantAction } from '../record-grant-action.ts';
import { buildMockGrantActionInput } from './build-mock-grant-action-input.ts';
import type { GrantsDeps } from './types.ts';

export function seedGrantAction(deps: GrantsDeps, input: Partial<GrantActionInput> = {}): GrantAction {
  return recordGrantAction(deps.db, buildMockGrantActionInput(input));
}
