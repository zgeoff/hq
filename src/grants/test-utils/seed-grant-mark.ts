import type { Mark } from '../../marks/mark-kinds.ts';
import { createGrantMark } from '../create-grant-mark.ts';
import type { GrantMarkInput } from '../types.ts';
import { buildMockGrantMarkInput } from './build-mock-grant-mark-input.ts';
import type { GrantsDeps } from './types.ts';

export function seedGrantMark(deps: GrantsDeps, input: Partial<GrantMarkInput> = {}): Mark {
  return createGrantMark(deps.db, buildMockGrantMarkInput(input));
}
