import type { Database } from 'bun:sqlite';
import { getMeta } from '../../db/get-meta.ts';
import type { ThroughputLine } from './types.ts';

// The line to print in place of a count when hq holds no current read of Linear's filed and In
// Progress issues: never read, or the last read failed. No count, so no colour and no alerts.
export function findUnreadLine(db: Database, name: string, target: string): ThroughputLine | null {
  const readAt = getMeta(db, 'linear_throughput_at');
  if (readAt === null) {
    return { name, detail: 'Linear not read yet', target, verdict: 'none', alerts: [] };
  }
  if (getMeta(db, 'linear_throughput_error')) {
    return { name, detail: `Linear read failed, last read ${readAt}`, target, verdict: 'none', alerts: [] };
  }
  return null;
}
