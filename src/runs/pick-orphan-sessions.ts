import type { FleetSession } from '../fleet/types.ts';

export interface OrphanFacts {
  sessions: readonly FleetSession[];
  fleetNames: ReadonlySet<string>;

  // Every session id any run recorded, including replaced and removed ones.
  recorded: readonly string[];

  // Every session id an open run lists as active.
  openActive: readonly string[];
}

// A run stores a short session id, which matches the full id atc lists by prefix.
export function isStoredSession(stored: readonly string[], id: string): boolean {
  return stored.some((short) => id.toLowerCase().startsWith(short.toLowerCase()));
}

// The owner's own sessions, and any session with an unknown parent, are never picked. A session
// with a descendant that is not also picked stays, as the whole tree is one unit. A child comes
// before its parent, so a parent's forget finds no children left.
export function pickOrphanSessions(facts: OrphanFacts): FleetSession[] {
  const fleetIDs = new Set(facts.sessions.filter((session) => facts.fleetNames.has(session.name)).map((session) => session.id));
  const byID = new Map(facts.sessions.map((session) => [session.id, session]));
  const isFromRuns = (session: FleetSession) => isStoredSession(facts.recorded, session.id);
  const isChildOfFleet = (session: FleetSession) => {
    const parent = session.parent === null || session.parent === undefined ? undefined : byID.get(session.parent);
    return parent !== undefined && (fleetIDs.has(parent.id) || isFromRuns(parent));
  };
  const candidates = facts.sessions.filter(
    (session) =>
      session.state === 'exited' &&
      session.pinned !== true &&
      !fleetIDs.has(session.id) &&
      !isStoredSession(facts.openActive, session.id) &&
      (isFromRuns(session) || isChildOfFleet(session)),
  );
  const candidateIDs = new Set(candidates.map((session) => session.id));
  const blocked = findBlockedAncestors(byID, facts.sessions.filter((session) => !candidateIDs.has(session.id)));
  const picked = candidates.filter((session) => !blocked.has(session.id));
  return picked.toSorted((first, second) => countDepth(byID, second) - countDepth(byID, first));
}

// Every ancestor of a session that is not picked, up the whole chain.
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
