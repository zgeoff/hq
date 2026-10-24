import type { Database } from 'bun:sqlite';
import { fleetIds } from '../atc/fleet-ids.ts';
import { roleName } from '../roles/role-name.ts';
import type { SingleRole } from '../roles/types.ts';
import type { OwnerProbeDeps } from './read-owner-session.ts';

export type RoleProbe = { verdict: 'match' } | { verdict: 'other' } | { verdict: 'unknown'; cause: string };

// Only the caller's session as atc's daemon found it from the kernel counts: never --by, HQ_AS or
// ATC_SESSION_ID, which are the caller's own words. It must be the id hq fleet recorded for the
// role; a live session that only shares the role's name is not it.
export async function readRoleSession(db: Database, deps: OwnerProbeDeps, role: SingleRole): Promise<RoleProbe> {
  const recorded = fleetIds(db)[roleName(role)];

  if (recorded === undefined || recorded === '') {
    return { verdict: 'other' };
  }
  try {
    const client = await deps.openClient();
    try {
      return matchPeerSession(client.peerSession, recorded);
    } finally {
      client.close();
    }
  } catch (error) {
    return { verdict: 'unknown', cause: error instanceof Error ? error.message : String(error) };
  }
}

function matchPeerSession(peerSession: string | null | undefined, recorded: string): RoleProbe {
  if (peerSession === undefined) {
    return { verdict: 'unknown', cause: "atc's hello names no caller session, so this daemon predates protocol 11 and cannot say who is asking" };
  }
  return peerSession === recorded ? { verdict: 'match' } : { verdict: 'other' };
}
