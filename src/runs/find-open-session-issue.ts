import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const IssueSchema = z.object({ issue: z.string() }).nullable();

// The issue of the open run a session works on, or null.
export function findOpenSessionIssue(db: Database, session: string): string | null {
  const row = IssueSchema.parse(db.query(`SELECT s.issue FROM run_sessions s JOIN runs r ON r.issue = s.issue WHERE s.session_id = ? AND r.state NOT IN ('done','dropped')`).get(session));
  return row?.issue ?? null;
}
