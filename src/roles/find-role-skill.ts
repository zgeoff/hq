import type { DeclaredSession } from './types.ts';

export function findRoleSkill(session: Pick<DeclaredSession, 'skills'>): string | null {
  return session.skills[0] ?? null;
}
