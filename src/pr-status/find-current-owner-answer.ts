import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const OwnerAnswerSchema = z.object({ seq: z.number(), data: z.string() });

export type OwnerAnswer = z.infer<typeof OwnerAnswerSchema>;

// The owner's answer to a call's current round: a console answer, or an `hq call answer` that atc
// placed in the owner's session. A call asked again since has no current answer.
export function findCurrentOwnerAnswer(db: Database, id: string): OwnerAnswer | null {
  const answer = OwnerAnswerSchema.nullable().parse(
    db
      .query("SELECT seq, data FROM events WHERE subject = 'ask' AND subject_id = ? AND (action = 'console-answer' OR (action = 'answered' AND json_extract(data, '$.ownerSession') = 1)) ORDER BY seq DESC LIMIT 1")
      .get(id),
  );
  if (answer === null) {
    return null;
  }
  const refiled = db.query("SELECT 1 FROM events WHERE subject = 'ask' AND subject_id = ? AND action IN ('reasked', 'requeued') AND seq > ? LIMIT 1").get(id, answer.seq);
  return refiled === null ? answer : null;
}
