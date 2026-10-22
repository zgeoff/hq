import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { READY_DETAIL } from './ready-by-lane.ts';
import { readReadyByLane } from './read-ready-by-lane.ts';
import type { ReadySummary, Skipped } from './types.ts';

// The Ready check: how many Ready issues z-delivery saw, how many lanes can take, how many it
// skipped with a reason. Null unless the detail is fresh and carries a total.
export function readySummary(db: Database, freshMinutes: number): ReadySummary | null {
  const detail = metaJson(db, 'lanes_ready_detail', READY_DETAIL, null);
  const eligible = Object.values(readReadyByLane(db, freshMinutes)).reduce((sum, lane) => sum + (lane.n ?? 0), 0);
  if (!detail || detail.total === null || !(now().getTime() - Date.parse(detail.at) <= freshMinutes * 60_000)) {
    return null;
  }
  return buildReadySummary(detail.total, eligible, detail.skipped);
}

function buildReadySummary(total: number, eligible: number, skipped: Skipped[]): ReadySummary {
  const unexplained = Math.max(0, total - eligible - skipped.length);
  return { total, eligible, skipped, unexplained, line: `Ready: ${total} total, ${eligible} eligible across lanes, ${skipped.length} skipped with reasons, ${unexplained} unexplained${unexplained > 0 ? ' UNEXPLAINED' : ''}` };
}
