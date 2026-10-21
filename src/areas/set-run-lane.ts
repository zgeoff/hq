import type { Database } from 'bun:sqlite';
import { logEvent } from '../log-event.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';

export function setRunLane(db: Database, issue: string, lane: string, actor: string): void {
  db.transaction(() => {
    const prev = db.query('SELECT lane FROM runs WHERE issue = ?').get(issue) as { lane: string | null } | null;
    if (!prev) throw new HqError('not_found', `no run ${issue}`);
    db.query('UPDATE runs SET lane = ?, updated_at = ? WHERE issue = ?').run(lane, iso(now()), issue);
    logEvent(db, 'run', issue, 'lane', actor, prev.lane, lane, {});
  }).immediate();
}
