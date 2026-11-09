import type { AwakeSession } from './types.ts';

export function isAsleepSession(session: AwakeSession): boolean {
  return !session.alive && (session.lifecycle?.vm === 'asleep' || session.lifecycle?.harness === 'suspended' || session.lifecycle?.desired === 'sleep');
}
