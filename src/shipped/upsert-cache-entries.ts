import type { Database } from 'bun:sqlite';
import { kdb } from '../kdb.ts';
import type { ShippedCacheRow } from '../kdb.ts';

export async function upsertCacheEntries(db: Database, entries: readonly ShippedCacheRow[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  await kdb(db)
    .insertInto('shipped_cache')
    .values([...entries])
    .onConflict((oc) =>
      oc.columns(['kind', 'key']).doUpdateSet((eb) => ({ body: eb.ref('excluded.body'), fetched_at: eb.ref('excluded.fetched_at'), expires_at: eb.ref('excluded.expires_at') })),
    )
    .execute();
}
