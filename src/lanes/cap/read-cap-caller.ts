import type { Database } from 'bun:sqlite';
import { fleetIds } from '../../atc/fleet-ids.ts';
import type { OwnerProbeDeps } from '../../pr-status/read-owner-session.ts';
import { roleName } from '../../roles/role-name.ts';

export type CapCaller = { kind: 'owner' | 'delivery'; by: string } | { kind: 'other' } | { kind: 'unknown'; cause: string };

export async function readCapCaller(db: Database, deps: OwnerProbeDeps): Promise<CapCaller> {
  try {
    const client = await deps.openClient();
    try {
      return pickCapCaller(db, client.peerSession);
    } finally {
      client.close();
    }
  } catch (error) {
    return { kind: 'unknown', cause: error instanceof Error ? error.message : String(error) };
  }
}

function pickCapCaller(db: Database, peerSession: string | null | undefined): CapCaller {
  if (peerSession === undefined) {
    return { kind: 'unknown', cause: "atc's hello names no caller session, so this daemon predates protocol 11 and cannot say who is asking" };
  }
  const recorded = fleetIds(db);
  const owner = roleName('owner');
  const delivery = roleName('orchestrator');
  if (peerSession === null || peerSession === '') {
    return { kind: 'other' };
  }
  if (recorded[owner] === peerSession) {
    return { kind: 'owner', by: owner };
  }
  return recorded[delivery] === peerSession ? { kind: 'delivery', by: delivery } : { kind: 'other' };
}
