import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { logEvent } from '../log-event.ts';
import type { PRKey } from './types.ts';
import { upsertPRStatus } from './upsert-pr-status.ts';

// Sets who holds the PR's next step, or clears it with null, and logs the write.
export async function recordPRNext(db: Database, key: PRKey, session: string | null, actor: string): Promise<void> {
  upsertPRStatus(db, key.repo, key.pr, { next: session, next_at: session === null ? null : iso(now()) });
  logEvent(db, 'hq', `pr:${key.repo}#${key.pr}`, 'pr-next', actor, null, null, { next: session });
}
