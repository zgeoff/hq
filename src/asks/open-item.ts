import type { Database } from 'bun:sqlite';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import { AskRowSchema } from './ask-row-schema.ts';
import { parseAskRow as hydrate } from './parse-ask-row.ts';
import type { Ask } from './types.ts';

export function openItem(db: Database): Ask | null {
  return hydrate(runSyncRow(db, kdb(db).selectFrom('asks').selectAll().where('state', '=', 'open').compile(), AskRowSchema));
}
