import { getDeclaredSessions } from '../roles/get-declared-sessions.ts';

// The roles with a state file: a declared session named z-<role> keeps <role>.md.
export function getStateRoles(): string[] {
  return getDeclaredSessions().flatMap((session) => (session.name.startsWith('z-') ? [session.name.slice(2)] : []));
}
