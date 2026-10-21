import type { Database } from 'bun:sqlite';
import { kdb } from '../kdb.ts';

// Keeps the head hq last saw on an existing record; the record's own time does not move.
export async function updatePRHead(db: Database, repo: string, pr: number, head: string): Promise<void> {
  await kdb(db).updateTable('pr_status').set({ head }).where('repo', '=', repo).where('pr', '=', pr).execute();
}
