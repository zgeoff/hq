import { isStoredSession } from './is-stored-session.ts';

export function findSessionIssue(rows: readonly { sessionID: string; issue: string }[], id: string): string | null {
  return rows.findLast((row) => isStoredSession([row.sessionID], id))?.issue ?? null;
}
