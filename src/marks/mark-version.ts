import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { addMark } from './add-mark.ts';
import type { Mark } from './mark-kinds.ts';

// The watcher marks each new hq version the first time it runs. The check, the mark and the
// checkpoint commit together, so a stop between them or a second watcher never marks it twice.
export function markVersion(db: Database, version: string, actor: string): Mark | null {
  return db
    .transaction((): Mark | null => {
      if (getMeta(db, 'marked_version') === version) return null;
      const m = addMark(db, { kind: 'hq', text: `hq ${version} running`, ref: null, at: null, actor });
      setMeta(db, 'marked_version', version);
      return m;
    })
    .immediate();
}
