import type { Database } from 'bun:sqlite';
import { kdb } from '../kdb.ts';
import type { PRStatusRow } from '../kdb.ts';

export async function findPRStatus(db: Database, repo: string, pr: number): Promise<PRStatusRow | null> {
  const row = await kdb(db).selectFrom('pr_status').selectAll().where('repo', '=', repo).where('pr', '=', pr).executeTakeFirst();
  return row ?? null;
}
