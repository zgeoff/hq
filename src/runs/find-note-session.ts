import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const SessionRowSchema = z.object({ session_id: z.string(), design_pass: z.number() }).nullable();

export function findNoteSession(db: Database, issue: string, key: string): { session_id: string; design_pass: number } | null {
  return issue === key ? null : SessionRowSchema.parse(db.query('SELECT session_id, design_pass FROM run_sessions WHERE session_id = ? OR substr(session_id,1,8) = ?').get(key, key));
}
