import type { Database } from 'bun:sqlite';
import type { Insertable } from 'kysely';
import type { HqTables } from '../db/hq-columns.ts';

export type RefusalInput = Omit<Insertable<HqTables['refusals']>, 'issue'>;

// The issue is the one the atc session's run was on, so a refusal never names an issue by itself.
export function writeRefusal(db: Database, refusal: RefusalInput): boolean {
  const result = db
    .query(
      `INSERT OR IGNORE INTO refusals (uuid, at, claude_session, transcript, subagent, cwd, atc_session, atc_name, issue, tool, input, reason, scanned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT issue FROM run_sessions WHERE session_id = ?), ?, ?, ?, ?)`,
    )
    .run(
      refusal.uuid,
      refusal.at,
      refusal.claude_session ?? null,
      refusal.transcript,
      refusal.subagent,
      refusal.cwd ?? null,
      refusal.atc_session ?? null,
      refusal.atc_name ?? null,
      refusal.atc_session ?? null,
      refusal.tool ?? null,
      refusal.input ?? null,
      refusal.reason ?? null,
      refusal.scanned_at,
    );

  return result.changes > 0;
}
