import type { Database } from 'bun:sqlite';
import { fleetIds } from '../atc/fleet-ids.ts';
import { roleName } from '../roles/role-name.ts';

export interface OwnerProbeClient {
  resolve: (target: string, known: Record<string, string>) => Promise<{ id: string }>;
  close: () => void;
}

export type OwnerProbe = { verdict: 'owner' } | { verdict: 'other' } | { verdict: 'unknown'; cause: string };

export interface OwnerProbeDeps {
  sessionID?: string;
  openClient: () => Promise<OwnerProbeClient>;
}

// --by and HQ_AS are the caller's own words, so only the session id resolved through atc counts.
export async function readOwnerSession(db: Database, deps: OwnerProbeDeps): Promise<OwnerProbe> {
  if (deps.sessionID === undefined || deps.sessionID === '') {
    return { verdict: 'other' };
  }
  try {
    const client = await deps.openClient();
    try {
      const owner = await client.resolve(roleName('owner'), fleetIds(db));
      return owner.id === deps.sessionID ? { verdict: 'owner' } : { verdict: 'other' };
    } finally {
      client.close();
    }
  } catch (error) {
    return { verdict: 'unknown', cause: error instanceof Error ? error.message : String(error) };
  }
}
