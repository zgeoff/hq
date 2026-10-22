import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import type { Runner } from '../runner/types.ts';
import { CLOSED_RUN_STATES } from '../transitions/closed-run-states.ts';
import { closePr } from './close-pr.ts';
import { GITHUB_ACTOR } from './github-actor.ts';
import { readGitHubPR } from './read-github-pr.ts';


const OPEN_REFS = z.array(z.object({ ref: z.string() }));

// Closes each open PR of an open run as GitHub reports it: merged with GitHub's time and merge
// commit, or closed. A failed read leaves the PR alone and reports it.
export async function closeGitHubRunPRs(db: Database, run: Runner): Promise<{ closed: string[]; errors: string[] }> {
  const placeholders = CLOSED_RUN_STATES.map(() => '?').join(', ');
  const rows = db.query(`SELECT p.ref FROM run_prs p JOIN runs r ON r.issue = p.issue WHERE p.state = 'open' AND r.state NOT IN (${placeholders}) ORDER BY p.added_at`).all(...CLOSED_RUN_STATES);
  const outcomes = await Promise.all(OPEN_REFS.parse(rows).map((row) => closeOne(db, run, row.ref)));
  return {
    closed: outcomes.flatMap((outcome) => (outcome.closed ? [outcome.ref] : [])),
    errors: outcomes.flatMap((outcome) => (outcome.error ? [outcome.error] : [])),
  };
}

async function closeOne(db: Database, run: Runner, ref: string): Promise<{ ref: string; closed: boolean; error: string | null }> {
  const pr = await readGitHubPR(run, ref);
  if ('error' in pr) {
    return { ref, closed: false, error: pr.error };
  }
  if (pr.state === 'OPEN') {
    return { ref, closed: false, error: null };
  }

  // Someone closed it by hand while gh was asked: their word stands.
  if (db.query('SELECT 1 FROM run_prs WHERE ref = ? AND state = ?').get(ref, 'open') === null) {
    return { ref, closed: false, error: null };
  }
  try {
    const facts = pr.state === 'MERGED' ? { mergedAt: pr.mergedAt, mergeSha: pr.mergeSha } : undefined;
    closePr(db, ref, { to: pr.state === 'MERGED' ? 'merged' : 'closed', actor: GITHUB_ACTOR, facts });
    return { ref, closed: true, error: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ref, closed: false, error: `${ref}: ${reason}` };
  }
}
