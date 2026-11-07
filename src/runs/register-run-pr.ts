import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { HqError } from '../errors.ts';
import { kdb } from '../kdb.ts';
import { normalizePrRef } from './normalize-pr-ref.ts';
import { requirePR as mustPr } from './require-pr.ts';
import { RunPrSchema } from './run-pr-schema.ts';
import type { RunPr } from './types.ts';

export function registerRunPR(db: Database, issue: string, raw: string): { pr: RunPr; added: boolean } {
  const { ref, url } = normalizePrRef(raw);
  const prev = runSyncRow(db, kdb(db).selectFrom('run_prs').selectAll().where('ref', '=', ref).compile(), RunPrSchema);
  if (prev) {
    if (prev.issue !== issue) throw new HqError('pr_taken', `${ref} is on ${prev.issue}`);
    if (url && !prev.url) db.query('UPDATE run_prs SET url = ? WHERE ref = ?').run(url, ref);
    return { pr: mustPr(db, ref), added: false };
  }
  const t = iso(now());
  db.query(`INSERT INTO run_prs (ref, issue, url, state, added_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?)`).run(ref, issue, url, t, t);
  return { pr: mustPr(db, ref), added: true };
}
