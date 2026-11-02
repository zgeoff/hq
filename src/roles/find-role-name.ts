import type { Role } from './role-names.ts';
import { ROLES } from './roles.ts';

export function findRoleName(role: Role): string | null {
  return ROLES.sessions.find((session) => session.roles.includes(role))?.name ?? null;
}
