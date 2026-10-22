import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';

// At a PR's final: how many review findings it fixed itself, and the follow-up issues filed
// from its review. Called inside finalPr's transaction. Saying it again replaces the count.
export function recordTally(db: Database, ref: string, issue: string, tally: { fixed: number | null; followups: string[] | null }, actor: string): void {
  const t = iso(now());
  if (tally.fixed !== null) db.query('UPDATE run_prs SET fixed_in_pr = ?, tally_at = ? WHERE ref = ?').run(tally.fixed, t, ref);
  for (const f of tally.followups ?? []) {
    db.query(`INSERT INTO followups (issue, from_ref, filed_at, source, added_by, added_at) VALUES (?, ?, ?, 'final', ?, ?) ON CONFLICT (issue) DO NOTHING`).run(f, ref, t, actor, t);
  }
  logEvent(db, 'run', issue, 'tally', actor, null, null, { ref, fixed: tally.fixed, followups: tally.followups });
}
