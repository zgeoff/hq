import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import type { RunPr } from './types.ts';
import { updateRunTime as touch } from './update-run-time.ts';

const ACTOR = 'hq review';

// hq review marks the PR's run itself, so no session has to: the round started, then the head it
// read once it ends ok. A PR on no run is left alone.
export function writeReviewStarted(db: Database, repo: string, pr: number): void {
  db.transaction(() => {
    const found = findOpenPR(db, repo, pr);
    if (found !== null) {
      writeStarted(db, found);
    }
  }).immediate();
}

// No round limit here: noslop's round cap already ran before the round.
export function writeReviewed(db: Database, repo: string, pr: number, head: string): void {
  db.transaction(() => {
    const found = findOpenPR(db, repo, pr);
    if (found !== null) {
      writeHead(db, found, head);
    }
  }).immediate();
}

function writeStarted(db: Database, found: RunPr): void {
  const t = iso(now());
  db.query('UPDATE run_prs SET review_started_at = ?, updated_at = ? WHERE ref = ?').run(t, t, found.ref);
  logEvent(db, 'run', found.issue, 'review-started', ACTOR, null, null, { ref: found.ref });
}

function writeHead(db: Database, found: RunPr, head: string): void {
  const round = found.review_round + 1,
    t = iso(now());
  db.query('UPDATE run_prs SET reviewed_sha = ?, review_round = ?, reviewed_at = ?, updated_at = ? WHERE ref = ?').run(head, round, t, t, found.ref);
  touch(db, found.issue);
  logEvent(db, 'run', found.issue, 'reviewed', ACTOR, null, null, { ref: found.ref, sha: head, round });
}

function findOpenPR(db: Database, repo: string, pr: number): RunPr | null {
  return db.query("SELECT * FROM run_prs WHERE ref = ? AND state = 'open'").get(`${repo}#${pr}`) as RunPr | null;
}
