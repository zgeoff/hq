import { addTyped } from '../add-typed.ts';
import type { Typed } from '../types.ts';
import { buildMockNewTyped } from './build-mock-new-typed.ts';
import type { NewTyped, TypedDeps } from './types.ts';

export function seedTyped(deps: TypedDeps, input: Partial<NewTyped> = {}): Typed {
  return addTyped(deps.db, buildMockNewTyped(input));
}
