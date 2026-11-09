import type { Database } from 'bun:sqlite';
import type { PRState } from './types.ts';

export function writeShippedPR(db: Database, state: Pick<PRState, 'ref' | 'sha' | 'tag' | 'at'>): void {
  db.query('UPDATE run_prs SET merge_sha = ?, shipped_tag = ?, shipped_at = ? WHERE ref = ?').run(state.sha, state.tag, state.at, state.ref);
}
