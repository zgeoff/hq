import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { readReviewerEvents } from './read-reviewer-events.ts';

const MechanicalSchema = z.object({ head: z.string(), files: z.array(z.string()), lines: z.number() });

// z-review's record that the PR's held edits are mechanical, at exactly this head; null when there
// is none. A push after the record voids it.
export function readHeadMechanical(db: Database, repo: string, pr: number, head: string): z.output<typeof MechanicalSchema> | null {
  const records = readReviewerEvents(db, repo, pr, 'pr-mechanical').flatMap((data) => {
    const parsed = MechanicalSchema.safeParse(data);
    return parsed.success ? [parsed.data] : [];
  });
  return records.find((record) => record.head === head) ?? null;
}
