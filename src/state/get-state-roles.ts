import { getDeclaredSessions } from '../roles/get-declared-sessions.ts';

export function getStateRoles(): string[] {
  return getDeclaredSessions().flatMap((session) => (session.name.startsWith('z-') ? [session.name.slice(2)] : []));
}
