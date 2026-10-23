import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { RunPr } from './types.ts';

const OPEN_PR = z.object({ ref: z.string(), issue: z.string(), review_round: z.number() }).nullable();

export function findOpenPR(db: Database, repo: string, pr: number): Pick<RunPr, 'ref' | 'issue' | 'review_round'> | null {
  return OPEN_PR.parse(db.query("SELECT ref, issue, review_round FROM run_prs WHERE ref = ? AND state = 'open'").get(`${repo}#${pr}`));
}
