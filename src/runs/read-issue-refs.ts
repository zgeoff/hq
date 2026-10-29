import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { IssueRefs } from './types.ts';

const IssuePRsSchema = z.array(z.object({ ref: z.string(), state: z.string(), design_pass: z.number() }));

export function readIssueRefs(db: Database, issue: string): IssueRefs {
  const rows = IssuePRsSchema.parse(db.query('SELECT ref, state, design_pass FROM run_prs WHERE issue = ? ORDER BY added_at').all(issue));
  const open = rows.filter((row) => row.state === 'open');
  return { all: new Set(rows.map((row) => row.ref)), open: new Set(open.map((row) => row.ref)), deliveryOpen: open.filter((row) => row.design_pass === 0).map((row) => row.ref) };
}
