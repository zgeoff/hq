import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { DESIGN_BACKLOG, DESIGN_BACKLOG_KEY } from './design-backlog.ts';
import type { DesignBacklog } from './design-backlog.ts';
import { LANES } from './lanes.ts';

export function readDesignBacklog(db: Database, at: Date = now()): DesignBacklog | null {
  const backlog = metaJson(db, DESIGN_BACKLOG_KEY, DESIGN_BACKLOG, null);
  if (backlog === null || at.getTime() - Date.parse(backlog.at) > LANES.readyFreshMinutes() * 60_000) {
    return null;
  }
  return backlog;
}
