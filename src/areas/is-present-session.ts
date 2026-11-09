import { isAsleepSession } from './is-asleep-session.ts';
import type { AwakeSession } from './types.ts';

export function isPresentSession(session: AwakeSession): boolean {
  return session.alive || isAsleepSession(session);
}
