import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { EXEMPT_RULES } from './exempt-rules.ts';
import { readReviewerEvents } from './read-reviewer-events.ts';

const ExemptionSchema = z.object({ head: z.string(), rule: z.enum(EXEMPT_RULES), note: z.string() });

// z-review's record that a policy exception covers the PR's held edits, at exactly this head; null
// when there is none. A push after the record voids it.
export function readHeadExemption(db: Database, repo: string, pr: number, head: string): z.output<typeof ExemptionSchema> | null {
  const records = readReviewerEvents(db, repo, pr, 'pr-exempt').flatMap((data) => {
    const parsed = ExemptionSchema.safeParse(data);
    return parsed.success ? [parsed.data] : [];
  });
  return records.find((record) => record.head === head) ?? null;
}
