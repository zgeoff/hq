import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const SessionSchema = z.object({ issue: z.string(), design_pass: z.number() }).nullable();

export function findOpenSession(db: Database, session: string): { issue: string; design_pass: number } | null {
  return SessionSchema.parse(db.query(`SELECT s.issue, s.design_pass FROM run_sessions s JOIN runs r ON r.issue = s.issue WHERE s.session_id = ? AND r.state NOT IN ('done','dropped')`).get(session));
}
