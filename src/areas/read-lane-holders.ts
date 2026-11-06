import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { collectLaneHolders } from './collect-lane-holders.ts';
import type { RunSessionRow } from './collect-lane-holders.ts';
import type { AwakeReading } from './read-fresh-awake.ts';
import { RUNNING } from './running.ts';

const rowsSchema = z.array(z.object({ issue: z.string(), session_id: z.string(), added_at: z.string() }));

export function readLaneHolders(db: Database, reading: AwakeReading, at: Date): RunSessionRow[] {
  const rows = rowsSchema.parse(db.query(`SELECT DISTINCT s.issue AS issue, s.session_id AS session_id, s.added_at AS added_at FROM run_sessions s JOIN runs r ON r.issue = s.issue WHERE r.state IN (${RUNNING.map(() => '?').join(', ')}) AND s.design_pass = 0`).all(...RUNNING));
  return collectLaneHolders(rows, reading, at);
}
