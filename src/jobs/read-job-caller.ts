import type { Database } from 'bun:sqlite';
import { findFleetName } from '../atc/find-fleet-name.ts';
import type { OwnerProbeDeps } from '../pr-status/read-owner-session.ts';
import { readPeerSession } from '../pr-status/read-role-session.ts';
import type { JobCaller } from './pick-job-access.ts';

// The name comes from the session atc's daemon found for the caller from the kernel, matched to the
// ids hq fleet recorded: never ATC_SESSION_ID, --by or HQ_AS, which the caller can set to anything.
export async function readJobCaller(db: Database, deps: OwnerProbeDeps): Promise<JobCaller> {
  const peer = await readPeerSession(deps);
  if (peer.kind === 'failed') {
    return { kind: 'unknown', cause: peer.cause };
  }
  if (peer.session === undefined) {
    return { kind: 'unknown', cause: "atc's hello names no caller session, so this daemon predates protocol 11 and cannot say who is asking" };
  }
  if (peer.session === null || peer.session === '') {
    return { kind: 'unnamed' };
  }
  const name = findFleetName(db, peer.session);
  return name === null ? { kind: 'unnamed' } : { kind: 'named', name };
}
