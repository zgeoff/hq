import { seedLinkedUnblock } from './seed-linked-unblock.ts';
import { seedOverdueToldUnblock } from './seed-overdue-told-unblock.ts';
import { seedUnblock } from './seed-unblock.ts';
import type { UnblockDeps } from './types.ts';

export function buildUnblockSeeder(deps: UnblockDeps) {
  return {
    unblock: (input?: Parameters<typeof seedUnblock>[1]) => seedUnblock(deps, input),
    linkedUnblock: (input: Parameters<typeof seedLinkedUnblock>[1]) => seedLinkedUnblock(deps, input),
    overdueToldUnblock: (input?: Parameters<typeof seedOverdueToldUnblock>[1]) => seedOverdueToldUnblock(deps, input),
  };
}
