import type { Database } from 'bun:sqlite';
import { getDeclaredSessions } from '../roles/get-declared-sessions.ts';
import type { Role } from '../roles/role-names.ts';
import { findFleetName } from './find-fleet-name.ts';

export interface Whois {
  session: string;
  name: string | null;
  roles: Role[];
}

export function readWhois(db: Database, id: string): Whois {
  const name = findFleetName(db, id);
  const roles = getDeclaredSessions().find((session) => session.name === name)?.roles ?? [];
  return { session: id, name, roles };
}
