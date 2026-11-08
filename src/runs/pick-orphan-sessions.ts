import type { FleetSession } from '../fleet/types.ts';
import { findSessionIssue } from './find-session-issue.ts';
import { isStoredSession } from './is-stored-session.ts';
import type { RunSessionRow } from './read-run-session-rows.ts';
import { isOnImp } from './run-wrap-up.ts';

export const ORPHAN_RETRY_MS = 24 * 3_600_000;

export interface OrphanFacts {
  sessions: readonly FleetSession[];
  fleetNames: ReadonlySet<string>;

  // Every session any run recorded, including replaced and removed ones, oldest first.
  runSessions: readonly RunSessionRow[];

  // Maps a full session id to the time the sweep last kept it.
  lastKeptMs: ReadonlyMap<string, number>;
  nowMs: number;
}

export interface OrphanSession {
  session: FleetSession;
  issue: string | null;
  place: 'imp' | 'local';
}

// A session with a descendant that is not also picked stays, as the whole tree is one unit. A
// child comes before its parent, so a parent's forget finds no children left. atc refuses to
// forget a session under a pinned parent, so such a child is never picked.
export function pickOrphanSessions(facts: OrphanFacts): OrphanSession[] {
  const fleetIDs = new Set(facts.sessions.filter((session) => facts.fleetNames.has(session.name)).map((session) => session.id));
  const byID = new Map(facts.sessions.map((session) => [session.id, session]));
  const recorded = facts.runSessions.map((row) => row.sessionID);
  const openActive = facts.runSessions.filter((row) => row.active && row.open).map((row) => row.sessionID);
  const ownerChat = facts.runSessions.filter((row) => row.ownerChats).map((row) => row.sessionID);
  const isFromRuns = (session: FleetSession) => isStoredSession(recorded, session.id);
  const findParent = (session: FleetSession) => (session.parent === null || session.parent === undefined ? undefined : byID.get(session.parent));
  const isChildOfKnownSession = (session: FleetSession) => {
    const parent = findParent(session);
    return parent !== undefined && (fleetIDs.has(parent.id) || isFromRuns(parent));
  };
  const isUnderPin = (session: FleetSession) => findParent(session)?.pinned === true;
  const isOwnerChat = (session: FleetSession) => {
    const parent = findParent(session);
    return isStoredSession(ownerChat, session.id) || (parent !== undefined && isStoredSession(ownerChat, parent.id));
  };
  const isRecentlyKept = (session: FleetSession) => facts.nowMs - (facts.lastKeptMs.get(session.id) ?? -Infinity) < ORPHAN_RETRY_MS;
  const candidates = facts.sessions.filter(
    (session) =>
      session.state === 'exited' &&
      session.pinned !== true &&
      !isUnderPin(session) &&
      !fleetIDs.has(session.id) &&
      !isStoredSession(openActive, session.id) &&
      !isOwnerChat(session) &&
      !isRecentlyKept(session) &&
      (isFromRuns(session) || isChildOfKnownSession(session)),
  );
  const candidateIDs = new Set(candidates.map((session) => session.id));
  const blocked = findBlockedAncestors(byID, facts.sessions.filter((session) => !candidateIDs.has(session.id)));
  const picked = candidates.filter((session) => !blocked.has(session.id));
  return picked
    .toSorted((first, second) => countDepth(byID, second) - countDepth(byID, first))
    .map((session) => ({ session, issue: findSessionIssue(facts.runSessions, session.id), place: isOnImp(session, false) ? 'imp' : 'local' }));
}

function findBlockedAncestors(byID: ReadonlyMap<string, FleetSession>, unpicked: readonly FleetSession[]): Set<string> {
  const blocked = new Set<string>();
  for (const session of unpicked) {
    let current = session;
    for (let step = 0; step < byID.size; step += 1) {
      const parent = current.parent === null || current.parent === undefined ? undefined : byID.get(current.parent);
      if (parent === undefined) {
        break;
      }
      blocked.add(parent.id);
      current = parent;
    }
  }
  return blocked;
}

function countDepth(byID: ReadonlyMap<string, FleetSession>, session: FleetSession): number {
  let depth = 0;
  let current = session;
  while (depth < byID.size) {
    const parent = current.parent === null || current.parent === undefined ? undefined : byID.get(current.parent);
    if (parent === undefined) {
      break;
    }
    depth += 1;
    current = parent;
  }
  return depth;
}
