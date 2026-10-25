import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { CIOverride } from './parse-ci-overrides.ts';
import { parseCIOverrides } from './parse-ci-overrides.ts';

const RowsSchema = z.array(z.object({ seq: z.number(), at: z.string(), data: z.string() }));

export function readCIOverrides(db: Database, repo: string, pr: number): CIOverride[] {
  return parseCIOverrides(RowsSchema.parse(db.query("SELECT seq, at, data FROM events WHERE subject = 'hq' AND subject_id = ? AND action = 'pr-override' ORDER BY seq").all(`pr:${repo}#${pr}`)));
}
