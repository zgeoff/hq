import { seedGrantAction } from './seed-grant-action.ts';
import { seedGrantMark } from './seed-grant-mark.ts';
import { seedVoidedGrantAction } from './seed-voided-grant-action.ts';
import type { GrantsDeps } from './types.ts';

export function buildGrantsSeeder(deps: GrantsDeps) {
  return {
    grantMark: (input?: Parameters<typeof seedGrantMark>[1]) => seedGrantMark(deps, input),
    grantAction: (input?: Parameters<typeof seedGrantAction>[1]) => seedGrantAction(deps, input),
    voidedGrantAction: (input?: Parameters<typeof seedVoidedGrantAction>[1]) => seedVoidedGrantAction(deps, input),
  };
}
