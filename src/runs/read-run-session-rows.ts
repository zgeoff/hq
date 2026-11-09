import { isOneOf } from '@zgeoff/std';
import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { CLOSED_RUN_STATES } from '../transitions/closed-run-states.ts';

const Rows = z.array(z.object({ session_id: z.string(), issue: z.string(), active: z.number(), ended_by: z.string().nullable(), state: z.string(), geoff_chat: z.number() }));

export interface RunSessionRow {
  sessionID: string;
  issue: string;
  active: boolean;
  endedBy: string | null;
  open: boolean;
  ownerChats: boolean;
}

// Every session any run recorded, including replaced and removed ones, oldest first.
export function readRunSessionRows(db: Database): RunSessionRow[] {
  const rows = Rows.parse(
    db.query('SELECT s.session_id, s.issue, s.active, s.ended_by, r.state, r.geoff_chat FROM run_sessions s JOIN runs r ON r.issue = s.issue ORDER BY s.added_at, s.session_id').all(),
  );
  return rows.map((row) => ({ sessionID: row.session_id, issue: row.issue, active: row.active === 1, endedBy: row.ended_by, open: !isOneOf(row.state, CLOSED_RUN_STATES), ownerChats: row.geoff_chat === 1 }));
}
