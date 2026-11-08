import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { RefusalRowSchema } from './refusal-row-schema.ts';
import type { RefusalRow } from './types.ts';

export function loadRefusalRows(db: Database, from: Date, to: Date = now()): RefusalRow[] {
  const query = kdb(db)
    .selectFrom('refusals')
    .select(['uuid', 'at', 'claude_session', 'transcript', 'subagent', 'cwd', 'atc_session', 'atc_name', 'issue', 'tool', 'input', 'reason'])
    .where('at', '>=', iso(from))
    .where('at', '<', iso(to))
    .orderBy('at', 'desc')
    .orderBy('uuid')
    .compile();
  return runSyncQuery(db, query, RefusalRowSchema);
}
