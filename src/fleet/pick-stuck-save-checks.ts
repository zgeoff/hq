import type { Check } from '../health/types.ts';
import type { RefreshMap } from './refresh-schema.ts';

export interface UnreadAnswer {
  sessionId: string;
  at: string;
  error: string;
}

const STUCK_MS = 60 * 60_000;

// A save request is stuck when no read of its answer has worked for over an hour, counted from the
// ask or from the last read atc answered, and a read failed since then: the restart then waits on
// an answer hq cannot see.
export function pickStuckSaveChecks(refresh: RefreshMap, unread: readonly UnreadAnswer[], at: Date): Check[] {
  const stuck = Object.entries(refresh).flatMap(([name, entry]) => {
    const askedAt = entry.askedAt;
    if (entry.phase !== 'asked' || askedAt === undefined) {
      return [];
    }
    const workedAt = entry.answerReadAt ?? askedAt;
    if (at.getTime() - Date.parse(askedAt) <= STUCK_MS || at.getTime() - Date.parse(workedAt) <= STUCK_MS) {
      return [];
    }
    const last = unread.findLast((answer) => answer.sessionId === entry.sessionId && answer.at >= workedAt);
    if (last === undefined) {
      return [];
    }
    return [{ key: `fleet-save-unread:${name}`, ok: false, line: `fleet: ${name} (session ${entry.sessionId.slice(0, 8)}) was asked to save at ${askedAt}, and no read of its answer has worked for over an hour: ${last.error}` }];
  });
  return stuck.length > 0 ? stuck : [{ key: 'fleet-save-unread', ok: true, line: 'fleet: hq can read the answer to every save request it asked' }];
}
