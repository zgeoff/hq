import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { z } from 'zod';
import { kdb } from '../kdb.ts';
import type { PRStatusRow } from '../kdb.ts';

export type PRStatusFields = Partial<Omit<PRStatusRow, 'repo' | 'pr' | 'updated_at'>>;

const BindingsSchema = z.array(z.union([z.string(), z.number(), z.null()]));

// Writes the given fields of a PR's record, creating the record when there is none. Fields not
// given keep their value. Kysely's execute waits on its own connection lock before it runs, so the
// write runs here, at once, and a caller's bun:sqlite transaction holds it.
export function upsertPRStatus(db: Database, repo: string, pr: number, fields: PRStatusFields): void {
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
  const query = kdb(db)
    .insertInto('pr_status')
    .values({ ...blank, ...fields, repo, pr, updated_at: updatedAt })
    .onConflict((oc) => oc.columns(['repo', 'pr']).doUpdateSet({ ...fields, updated_at: updatedAt }))
    .compile();
  db.prepare(query.sql).run(...BindingsSchema.parse(query.parameters));
}
