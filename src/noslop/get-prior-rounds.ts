import type { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';

export interface PriorRounds {
  codexBefore: boolean;
  noslopBefore: boolean;
}

// What the PR has had already. A Codex round is the Codex review file, or a run PR with a review
// round recorded; a noslop round is a noslop_rounds review row (a check row does not count).
export function getPriorRounds(db: Database, repo: string, pr: number, codexFile: string): PriorRounds {
  const noslop = db.query("SELECT 1 AS one FROM noslop_rounds WHERE repo = ? AND pr = ? AND kind = 'review' LIMIT 1").get(repo, pr),
    run = db.query('SELECT MAX(review_round) AS review_round FROM run_prs WHERE LOWER(ref) = LOWER(?)').get(`${repo}#${pr}`) as { review_round: number | null } | null;
  return {
    codexBefore: existsSync(codexFile) || (run?.review_round ?? 0) > 0,
    noslopBefore: noslop !== null,
  };
}
