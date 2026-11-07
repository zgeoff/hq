import type { Database } from 'bun:sqlite';
import { sql } from 'kysely';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import { AskRowSchema } from './ask-row-schema.ts';
import { parseAskRow as hydrate } from './parse-ask-row.ts';
import type { Ask, Kind } from './types.ts';

// oxlint-disable-next-line zgeoff/function-verb -- named as its callers use it
export function nextEligible(db: Database, kind?: Kind, at: Date = now()): Ask | null {
  const t = iso(at);
  const query = kdb(db)
    .selectFrom('asks')
    .selectAll()
    .where((eb) => eb.or([eb('state', '=', 'queued'), eb.and([eb('state', '=', 'later'), eb('due_at', '<=', t)])]))
    .$if(kind !== undefined, (builder) => builder.where('kind', '=', kind ?? 'call'))
    .orderBy(sql`send_order IS NULL`)
    .orderBy('send_order')
    .orderBy(sql`COALESCE(CASE WHEN state = 'later' THEN due_at END, queued_at)`)
    .orderBy('id')
    .limit(1)
    .compile();
  return hydrate(runSyncRow(db, query, AskRowSchema));
}
