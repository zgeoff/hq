import type { Database } from 'bun:sqlite';

// Sessions to watch: each open row's active session.
export function watchlist(db: Database): { session_id: string; issue: string }[] {
  return db
    .query(
      `SELECT s.session_id, s.issue FROM run_sessions s JOIN runs r ON r.issue = s.issue
       WHERE s.active = 1 AND r.state NOT IN ('done','dropped') ORDER BY s.added_at`,
    )
    .all() as { session_id: string; issue: string }[];
}
