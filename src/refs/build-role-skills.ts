import { ROLE_NAMES } from '../roles/role-names.ts';
import type { RolesTable } from '../roles/types.ts';
import type { RoleSkills } from './types.ts';

// Each role's session names and skills, in ROLE_NAMES order. A name that forwards to a holder
// counts as that holder; every skill a holder lists counts, shared ones under each role that lists them.
export function buildRoleSkills(table: RolesTable): RoleSkills[] {
  return ROLE_NAMES.map((role) => {
    const holders = table.sessions.filter((session) => session.roles.includes(role));
    const holderNames = holders.map((session) => session.name);
    const forwarded = Object.entries(table.forwards)
      .filter(([, target]) => holderNames.includes(target))
      .map(([name]) => name);
    const skills = holders.flatMap((session) => session.skills);
    return { role, names: [...holderNames, ...forwarded], skills: [...new Set(skills)] };
  });
}
