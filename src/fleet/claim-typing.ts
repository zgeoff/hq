import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { setMeta } from '../db/set-meta.ts';
import { loadRcPending as rcPending } from './load-rc-pending.ts';
import { RC_PENDING } from './rc-pending.ts';

// The one place that decides to type: true only for the caller that found typedAt empty.
export function claimTyping(db: Database, name: string, id: string, t: Date): boolean {
  return db
    .transaction(() => {
      const all = rcPending(db);
      const cur = all[name];
      if (!cur || cur.id !== id || cur.typedAt) return false;
      all[name] = { ...cur, typedAt: iso(t) };
      setMeta(db, RC_PENDING, JSON.stringify(all));
      return true;
    })
    .immediate();
}
