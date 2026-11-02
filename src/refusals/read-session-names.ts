import { readAtcSessions } from '../atc/read-atc-sessions.ts';
import type { SessionInfo } from '../atc/session-schema.ts';
import type { Who } from './types.ts';

export async function readSessionNames(get?: () => Promise<SessionInfo[]>): Promise<Map<string, Who>> {
  const map = new Map<string, Who>();
  try {
    const list = get ? await get() : await readAtcSessions();
    for (const session of list) {
      if (session.agentSessionID) {
        map.set(session.agentSessionID, { id: session.id, name: session.name });
      }
    }
  } catch {
    // atc down: no session names
  }
  return map;
}
