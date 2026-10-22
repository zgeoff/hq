// Review follow-ups (GEO-998): issues filed from a PR review, and review findings fixed in the
// same PR, per week around the re-check rule (nixie-definitions#135: findings are fixed in their
// own PR), so the change can be judged on numbers.
import type { Database } from 'bun:sqlite';
import type { Followup } from './types.ts';

export function listFollowups(db: Database): Followup[] {
  return db.query('SELECT * FROM followups ORDER BY filed_at, issue').all() as Followup[];
}
