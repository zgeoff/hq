import type { Database } from 'bun:sqlite';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import type { AskState } from '../transitions/ask-states.ts';
import { AskRowSchema } from './ask-row-schema.ts';
import { parseAskRow as hydrate } from './parse-ask-row.ts';
import type { Ask, Kind } from './types.ts';

export function listAsks(db: Database, opts: { kind?: Kind; states?: AskState[] } = {}): Ask[] {
  const states = opts.states ?? [];
  const query = kdb(db)
    .selectFrom('asks')
    .selectAll()
    .$if(Boolean(opts.kind), (builder) => builder.where('kind', '=', opts.kind ?? 'call'))
    .$if(states.length > 0, (builder) => builder.where('state', 'in', states))
    .orderBy('queued_at')
    .orderBy('id')
    .compile();
  return runSyncQuery(db, query, AskRowSchema).map((r) => hydrate(r)!);
}
