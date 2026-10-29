import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { setMeta } from '../db/set-meta.ts';
import { DESIGN_BACKLOG_KEY } from './design-backlog.ts';
import type { ReadyIssue } from './types.ts';

interface DesignBacklogRead {
  agent: ReadyIssue[];
  withGeoff: ReadyIssue[];
  at: Date;
}

// Stores the needs-design issues the Backlog read found, with its read time, so the slot plan names
// them without a Linear call.
export function writeDesignBacklog(db: Database, read: DesignBacklogRead): void {
  setMeta(db, DESIGN_BACKLOG_KEY, JSON.stringify({ at: iso(read.at), agent: read.agent, withGeoff: read.withGeoff }));
}
