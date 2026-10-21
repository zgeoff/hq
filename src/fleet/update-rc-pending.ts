import type { Database } from 'bun:sqlite';
import { setMeta } from '../db/set-meta.ts';
import { loadRcPending as rcPending } from './load-rc-pending.ts';
import { RC_PENDING } from './rc-pending.ts';
import type { RcPending } from './types.ts';

export function updateRcPending(db: Database, name: string, p: RcPending | null): void {
  db.transaction(() => {
    const all = rcPending(db);
    if (p) all[name] = p;
    else delete all[name];
    setMeta(db, RC_PENDING, Object.keys(all).length ? JSON.stringify(all) : null);
  }).immediate();
}
