import { getDeclaredSessions } from '../roles/get-declared-sessions.ts';
import { toStateRole } from './to-state-role.ts';

export function getStateOwner(role: string): string {
  return getDeclaredSessions().find((session) => toStateRole(session.name) === role)?.name ?? `z-${role}`;
}
