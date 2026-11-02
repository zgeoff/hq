import type { Database } from 'bun:sqlite';
import { getMeta } from '../../db/get-meta.ts';
import type { ThroughputLine } from './types.ts';

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
