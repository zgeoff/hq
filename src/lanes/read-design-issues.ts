import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const designSchema = z.array(z.object({ issue: z.string() }));

export function readDesignIssues(db: Database): Set<string> {
  const rows = designSchema.parse(db.query("SELECT issue FROM linear_issues WHERE type = 'Design'").all());
  return new Set(rows.map((row) => row.issue));
}
