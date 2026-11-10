import type { ZSession } from './types.ts';

export function isZSession(name: string, sessions: readonly string[]): name is ZSession {
  return sessions.includes(name);
}
