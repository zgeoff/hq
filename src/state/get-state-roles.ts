import { getDeclaredSessions } from '../roles/get-declared-sessions.ts';
import { toStateRole } from './to-state-role.ts';

export function getStateRoles(): string[] {
  return getDeclaredSessions().map((session) => toStateRole(session.name));
}
