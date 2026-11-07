import { isOneOf } from '@zgeoff/std';
import { buildRecord } from '../build-record.ts';
import type { Role } from './role-names.ts';
import { ROLE_NAMES } from './role-names.ts';
import { ROLES } from './roles.ts';
import { SINGLE } from './single.ts';

export function rolesByName(retired: string[] = []): Record<Role, string | string[] | null> {
  return buildRecord(ROLE_NAMES, (role) => {
    const names = ROLES.sessions.filter((session) => session.roles.includes(role) && !retired.includes(session.name)).map((session) => session.name);
    return isOneOf(role, SINGLE) ? (names[0] ?? null) : names;
  });
}
