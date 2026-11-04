import type { FleetSession } from '../fleet/types.ts';
import type { HandedInSessionRow } from './pick-handed-in-candidates.ts';

export type AtcSession = Pick<FleetSession, 'id' | 'state' | 'parent' | 'lastMsg'>;

// The wrap-up forgets every session of the run that atc lists, active or not, with all their
// sub-sessions, so each of them is checked. An active session atc does not list returns null.
export function collectGuardedSessions(rows: readonly HandedInSessionRow[], sessions: readonly AtcSession[]): AtcSession[] | null {
  const roots: AtcSession[] = [];
  for (const row of rows) {
    const session = findAtcSession(sessions, row.session_id);
    if (session !== null) {
      roots.push(session);
    } else if (row.active === 1) {
      return null;
    }
  }
  const guarded = new Map<string, AtcSession>();
  for (const root of roots) {
    for (const session of [root, ...collectDescendants(sessions, root.id)]) {
      guarded.set(session.id, session);
    }
  }
  return [...guarded.values()];
}

// A run can store a short session id, which matches the full id atc lists by prefix.
function findAtcSession(sessions: readonly AtcSession[], id: string): AtcSession | null {
  const prefix = id.toLowerCase();
  const hits = sessions.filter((session) => session.id.toLowerCase().startsWith(prefix));
  return hits.length === 1 ? (hits[0] ?? null) : null;
}

function collectDescendants(sessions: readonly AtcSession[], parentID: string): AtcSession[] {
  const found: AtcSession[] = [];
  for (const child of sessions.filter((session) => session.parent === parentID)) {
    found.push(child, ...collectDescendants(sessions, child.id));
  }
  return found;
}
