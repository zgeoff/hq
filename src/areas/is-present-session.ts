import type { AwakeSession } from './types.ts';

// A session atc lists that is alive or asleep (its vm or harness suspended, or meant to sleep). One
// atc no longer lists, or lists as ended, is gone.
export function isPresentSession(session: AwakeSession): boolean {
  return session.alive || session.lifecycle?.vm === 'asleep' || session.lifecycle?.harness === 'suspended' || session.lifecycle?.desired === 'sleep';
}
