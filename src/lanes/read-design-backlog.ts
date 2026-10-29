import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { DESIGN_BACKLOG, DESIGN_BACKLOG_KEY } from './design-backlog.ts';
import type { DesignBacklog } from './design-backlog.ts';
import { LANES } from './lanes.ts';

// The last Backlog read's needs-design issues while it is fresh (the Ready read's 30 min); null when
// none or stale, so the plan never names a ticket Linear may have moved on from.
export function readDesignBacklog(db: Database, at: Date = now()): DesignBacklog | null {
  const backlog = metaJson(db, DESIGN_BACKLOG_KEY, DESIGN_BACKLOG, null);
  if (backlog === null || at.getTime() - Date.parse(backlog.at) > LANES.readyFreshMinutes() * 60_000) {
    return null;
  }
  return backlog;
}
