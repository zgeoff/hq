import type { Role } from './role-names.ts';
import { ROLE_NAMES } from './role-names.ts';
import { ROLES } from './roles.ts';
import { SINGLE } from './single.ts';

export function rolesByName(retired: string[] = []): Record<Role, string | string[] | null> {
  const out = {} as Record<Role, string | string[] | null>;
  for (const r of ROLE_NAMES) {
    const names = ROLES.sessions.filter((s) => s.roles.includes(r) && !retired.includes(s.name)).map((s) => s.name);
    out[r] = (SINGLE as readonly string[]).includes(r) ? (names[0] ?? null) : names;
  }
  return out;
}
