import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import { logEvent } from '../log-event.ts';
import type { Size } from './bands.ts';

export function setSize(db: Database, issue: string, guess: { size: Size; lines: number }, actor: string): void {
  db.transaction(() => {
    const prev = db.query('SELECT size, size_lines FROM runs WHERE issue = ?').get(issue) as { size: string | null; size_lines: number | null } | null;
    if (!prev) throw new HqError('not_found', `no run ${issue}`);
    db.query('UPDATE runs SET size = ?, size_lines = ?, updated_at = ? WHERE issue = ?').run(guess.size, guess.lines, iso(now()), issue);
    logEvent(db, 'run', issue, 'sized', actor, prev.size, guess.size, { lines: guess.lines, prevLines: prev.size_lines });
  }).immediate();
}
