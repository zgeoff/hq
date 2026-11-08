import type { OrphanSession } from './pick-orphan-sessions.ts';
import type { OrphanEvent } from './types.ts';

export function buildOrphanKeptEvent(orphan: OrphanSession, reason: string): OrphanEvent {
  const session = orphan.session;
  return { sessionID: session.id, action: 'session-kept', data: { reason, issue: orphan.issue }, line: `orphan session ${session.id} (${session.name}) kept: ${reason}` };
}
