import { ROLES } from './roles.ts';
import type { DeclaredSession } from './types.ts';

export function getDeclaredSessions(): DeclaredSession[] {
  return ROLES.sessions;
}
