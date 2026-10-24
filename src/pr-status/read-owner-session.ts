import type { Database } from 'bun:sqlite';
import { readRoleSession } from './read-role-session.ts';

export interface OwnerProbeClient {
  peerSession: string | null | undefined;
  close: () => void;
}

export type OwnerProbe = { verdict: 'owner' } | { verdict: 'other' } | { verdict: 'unknown'; cause: string };

export interface OwnerProbeDeps {
  openClient: () => Promise<OwnerProbeClient>;
}

export async function readOwnerSession(db: Database, deps: OwnerProbeDeps): Promise<OwnerProbe> {
  const probe = await readRoleSession(db, deps, 'owner');
  return probe.verdict === 'match' ? { verdict: 'owner' } : probe;
}
