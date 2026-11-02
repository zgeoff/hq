import type { ReferenceCount, RoleSkills } from './types.ts';

export function buildReferenceCounts(roles: RoleSkills[], references: Map<string, string[]>, opens: Map<string, Set<string>>, names: Map<string, string>): ReferenceCount[] {
  return roles.flatMap((holder) => {
    const roleOpens = [...opens].filter(([session]) => holder.names.includes(names.get(session) ?? '')).map(([, opened]) => opened);
    return holder.skills.flatMap((skill) =>
      (references.get(skill) ?? []).map((reference) => ({ role: holder.role, reference, count: roleOpens.filter((opened) => opened.has(reference)).length })),
    );
  });
}
