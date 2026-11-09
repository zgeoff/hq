import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { HqError } from '../errors.ts';
import { kdb } from '../kdb.ts';
import { normalizePRRef } from './normalize-pr-ref.ts';
import { requirePR as mustPR } from './require-pr.ts';
import { RunPRSchema } from './run-pr-schema.ts';
import type { RunPR } from './types.ts';

export function registerRunPR(db: Database, issue: string, raw: string): { pr: RunPR; added: boolean } {
  const normalized = normalizePRRef(raw);
  const ref = normalized.ref;
  const url = normalized.url;
  const previous = runSyncRow(db, kdb(db).selectFrom('run_prs').selectAll().where('ref', '=', ref).compile(), RunPRSchema);
  if (previous) {
    if (previous.issue !== issue) {
      throw new HqError('pr_taken', `${ref} is on ${previous.issue}`);
    }
    if (url && !previous.url) {
      db.query('UPDATE run_prs SET url = ? WHERE ref = ?').run(url, ref);
    }
    return { pr: mustPR(db, ref), added: false };
  }
  const t = iso(now());
  db.query(`INSERT INTO run_prs (ref, issue, url, state, added_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?)`).run(ref, issue, url, t, t);
  return { pr: mustPR(db, ref), added: true };
}
