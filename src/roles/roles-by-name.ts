import type { Role } from './role-names.ts';
import { ROLE_NAMES } from './role-names.ts';
import { ROLES } from './roles.ts';
import { SINGLE } from './single.ts';

// Role -> name (one-holder roles) or names, for `hq fleet --json`.
// Each role's holder, as `hq fleet --json` reports it. A retired holder is left out, the same as in
// `declared`: a single role held only by a retired session reads null.
export function rolesByName(retired: string[] = []): Record<Role, string | string[] | null> {
  const out = {} as Record<Role, string | string[] | null>;
  for (const r of ROLE_NAMES) {
    const names = ROLES.sessions.filter((s) => s.roles.includes(r) && !retired.includes(s.name)).map((s) => s.name);
    out[r] = (SINGLE as readonly string[]).includes(r) ? (names[0] ?? null) : names;
  }
  return out;
}
