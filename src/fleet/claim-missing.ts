import type { Database } from 'bun:sqlite';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { strMap } from '../db/str-map.ts';

// The stored start of a name's gap, or `mine` if none is stored yet; written before it returns.
export function claimMissing(db: Database, name: string, mine: string): string {
  return db
    .transaction(() => {
      const stored = metaJson(db, 'fleet_missing_since', strMap, {});
      if (stored[name]) return stored[name];
      stored[name] = mine;
      setMeta(db, 'fleet_missing_since', JSON.stringify(stored));
      return mine;
    })
    .immediate();
}
