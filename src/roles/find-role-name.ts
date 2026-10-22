import type { Role } from './role-names.ts';
import { ROLES } from './roles.ts';

// The first session that holds a role fleet.json need not give to exactly one session.
export function findRoleName(role: Role): string | null {
  return ROLES.sessions.find((session) => session.roles.includes(role))?.name ?? null;
}
