import { ROLES } from './roles.ts';
import type { SingleRole } from './types.ts';

export function roleName(role: SingleRole): string {
  return ROLES.sessions.find((s) => s.roles.includes(role))!.name;
}
