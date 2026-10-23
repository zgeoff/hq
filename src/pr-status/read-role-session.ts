import type { Database } from 'bun:sqlite';
import { fleetIds } from '../atc/fleet-ids.ts';
import { roleName } from '../roles/role-name.ts';
import type { SingleRole } from '../roles/types.ts';
import type { OwnerProbeDeps } from './read-owner-session.ts';

export type RoleProbe = { verdict: 'match' } | { verdict: 'other' } | { verdict: 'unknown'; cause: string };

// --by and HQ_AS are the caller's own words, so only the session id resolved through atc counts.
export async function readRoleSession(db: Database, deps: OwnerProbeDeps, role: SingleRole): Promise<RoleProbe> {
  if (deps.sessionID === undefined || deps.sessionID === '') {
    return { verdict: 'other' };
  }
  try {
    const client = await deps.openClient();
    try {
      const found = await client.resolve(roleName(role), fleetIds(db));
      return found.id === deps.sessionID ? { verdict: 'match' } : { verdict: 'other' };
    } finally {
      client.close();
    }
  } catch (error) {
    return { verdict: 'unknown', cause: error instanceof Error ? error.message : String(error) };
  }
}
