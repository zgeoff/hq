import type { DeclaredSession } from './types.ts';

// The role skill is the first skill a session declares; a session with a prompt file of its own has none.
export function findRoleSkill(session: Pick<DeclaredSession, 'skills'>): string | null {
  return session.skills[0] ?? null;
}
