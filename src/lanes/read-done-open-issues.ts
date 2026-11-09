import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { pickStaleKind } from '../linear/pick-stale-kind.ts';
import { readStartedPRs } from '../linear/read-started-prs.ts';

const startedSchema = z.object({ issue: z.string(), started_at: z.string() });

export function readDoneOpenIssues(db: Database): Map<string, string> {
  const prs = readStartedPRs(db);
  const done = new Map<string, string>();
  for (const row of z.array(startedSchema).parse(db.query('SELECT issue, started_at FROM linear_started ORDER BY issue').all())) {
    const stale = pickStaleKind(row.started_at, prs.get(row.issue) ?? []);
    if (stale.kind === 'done-open') {
      done.set(row.issue, stale.since);
    }
  }
  return done;
}
