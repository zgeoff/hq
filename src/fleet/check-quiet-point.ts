import type { Database } from 'bun:sqlite';
import { STALE_LIMITS } from './stale-limits.ts';
import type { StaleSessionView } from './stale-session-view.ts';

export function checkQuietPoint(db: Database, session: StaleSessionView, nowMs: number): string | null {
  if (session.state !== 'done') {
    return `atc state is ${session.state ?? 'unknown'}, not done`;
  }
  const deploying = db
    .query(`SELECT r.issue FROM run_sessions rs JOIN runs r ON r.issue = rs.issue WHERE rs.session_id = ? AND rs.active = 1 AND r.state IN ('deploying','deploy-held') LIMIT 1`)
    .get(session.id) as { issue: string } | null;
  if (deploying) {
    return `its run ${deploying.issue} is deploying`;
  }
  if (db.query(`SELECT 1 AS one FROM outbox WHERE status IN ('pending','failed') AND target IN (?, ?) LIMIT 1`).get(session.id, session.name)) {
    return 'a message to it is waiting in the outbox';
  }
  if (nowMs - session.lastActivityAt < STALE_LIMITS.activityWindowMs) {
    return 'it was active under 2 minutes ago';
  }
  return null;
}
