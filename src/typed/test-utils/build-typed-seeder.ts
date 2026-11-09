import { seedTyped } from './seed-typed.ts';
import type { TypedDeps } from './types.ts';

export function buildTypedSeeder(deps: TypedDeps) {
  return {
    typed: (input?: Parameters<typeof seedTyped>[1]) => seedTyped(deps, input),
  };
}
