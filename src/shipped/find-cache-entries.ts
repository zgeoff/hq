import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { kdb } from '../kdb.ts';
import type { ShippedCacheRow } from '../kdb.ts';

// The bodies kept for these keys of one kind, by key, leaving out an entry that has expired by `at`.
export async function findCacheEntries(db: Database, kind: ShippedCacheRow['kind'], keys: readonly string[], at: Date): Promise<Map<string, string>> {
  const CHUNK = 500,
    found = new Map<string, string>();
  for (let i = 0; i < keys.length; i += CHUNK) {
    const rows = await kdb(db)
      .selectFrom('shipped_cache')
      .select(['key', 'body'])
      .where('kind', '=', kind)
      .where('key', 'in', keys.slice(i, i + CHUNK))
      .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', iso(at))]))
      .execute();
    for (const row of rows) {
      found.set(row.key, row.body);
    }
  }
  return found;
}
