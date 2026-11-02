import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { roleName } from '../roles/role-name.ts';

const RowsSchema = z.array(z.object({ data: z.string() }));

export function readReviewerEvents(db: Database, repo: string, pr: number, action: 'pr-mechanical' | 'pr-exempt'): unknown[] {
  const rows = RowsSchema.parse(db.query("SELECT data FROM events WHERE subject = 'hq' AND subject_id = ? AND action = ? AND actor = ? ORDER BY seq DESC").all(`pr:${repo}#${pr}`, action, roleName('reviewer')));
  return rows.flatMap((row) => {
    try {
      const data: unknown = JSON.parse(row.data);
      return [data];
    } catch {
      return [];
    }
  });
}
