import type { AwakeSession } from './types.ts';

// A session that is not alive but that atc keeps: its vm or harness sleeps, or it is set to.
export function isAsleepSession(session: AwakeSession): boolean {
  return !session.alive && (session.lifecycle?.vm === 'asleep' || session.lifecycle?.harness === 'suspended' || session.lifecycle?.desired === 'sleep');
}
