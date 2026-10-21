import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { kdb } from '../kdb.ts';
import type { PRStatusRow } from '../kdb.ts';

export type PRStatusFields = Partial<Omit<PRStatusRow, 'repo' | 'pr' | 'updated_at'>>;

// Writes the given fields of a PR's record, creating the record when there is none. Fields not
// given keep their value.
export async function upsertPRStatus(db: Database, repo: string, pr: number, fields: PRStatusFields): Promise<void> {
  const blank: Omit<PRStatusRow, 'repo' | 'pr' | 'updated_at'> = {
      head: null,
      gate: null,
      gate_head: null,
      gate_at: null,
      answer: null,
      answer_head: null,
      answer_source: null,
      answer_note: null,
      answer_at: null,
      next: null,
      next_at: null,
    },
    updatedAt = iso(now());
  await kdb(db)
    .insertInto('pr_status')
    .values({ ...blank, ...fields, repo, pr, updated_at: updatedAt })
    .onConflict((oc) => oc.columns(['repo', 'pr']).doUpdateSet({ ...fields, updated_at: updatedAt }))
    .execute();
}
