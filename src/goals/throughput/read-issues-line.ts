import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../../clock/iso.ts';
import { getMeta } from '../../db/get-meta.ts';
import { buildUnreadLine } from './build-unread-line.ts';
import { readFiledIssues } from './read-filed-issues.ts';
import type { IssueSource, ThroughputLine } from './types.ts';

const NAME = 'Issues';
const countSchema = z.object({ count: z.number() });
const SOURCES: readonly IssueSource[] = ['owner', 'design', 'agent', 'review', 'live check', 'bot'];

// Issues filed against issues closed (completed or canceled), with no target.
export function readIssuesLine(db: Database, from: Date, at: Date): ThroughputLine {
  if (getMeta(db, 'linear_throughput_at') === null) {
    return buildUnreadLine(NAME, 'none');
  }
  const filed = readFiledIssues(db, from, at);
  const closed = countSchema.parse(db.query(`SELECT COUNT(*) AS count FROM linear_issues WHERE state IN ('completed', 'canceled') AND closed_at >= ? AND closed_at < ?`).get(iso(from), iso(at)));
  const split = SOURCES.map((source) => `${source} ${filed.filter((issue) => issue.source === source).length}`).join(', ');
  return { name: NAME, detail: `today ${filed.length} filed (${split}), ${closed.count} closed`, target: 'none', verdict: 'none', alerts: [] };
}
