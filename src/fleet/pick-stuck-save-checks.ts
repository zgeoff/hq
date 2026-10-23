import type { Check } from '../health/types.ts';
import type { RefreshMap } from './refresh-schema.ts';

export interface UnreadAnswer {
  sessionId: string;
  at: string;
  error: string;
}

const STUCK_MS = 60 * 60_000;

// A save request is stuck when it has been asked for over an hour, atc has answered no read of it
// since the ask, and at least one read failed: the restart then waits on an answer hq cannot see.
export function pickStuckSaveChecks(refresh: RefreshMap, unread: readonly UnreadAnswer[], at: Date): Check[] {
  const stuck = Object.entries(refresh).flatMap(([name, entry]) => {
    const askedAt = entry.askedAt;
    if (entry.phase !== 'asked' || askedAt === undefined || entry.answerReadAt !== undefined || at.getTime() - Date.parse(askedAt) <= STUCK_MS) {
      return [];
    }
    const last = unread.filter((answer) => answer.sessionId === entry.sessionId && answer.at >= askedAt).at(-1);
    if (last === undefined) {
      return [];
    }
    return [{ key: `fleet-save-unread:${name}`, ok: false, line: `fleet: ${name} (session ${entry.sessionId.slice(0, 8)}) was asked to save at ${askedAt}, and every read of its answer since failed: ${last.error}` }];
  });
  return stuck.length > 0 ? stuck : [{ key: 'fleet-save-unread', ok: true, line: 'fleet: hq can read the answer to every save request it asked' }];
}
