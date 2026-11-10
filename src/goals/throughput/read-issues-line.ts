import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../../clock/iso.ts';
import { Z_SESSIONS } from '../../linear/types.ts';
import { findUnreadLine } from './find-unread-line.ts';
import { readFiledIssues } from './read-filed-issues.ts';
import type { IssueSource, ThroughputLine } from './types.ts';

const NAME = 'Issues';
const countSchema = z.object({ count: z.number() });
const SOURCES: readonly IssueSource[] = ['owner', 'design', 'agent', 'review', 'live check', 'bot'];
const SESSION_SOURCES: readonly IssueSource[] = Z_SESSIONS;

export function readIssuesLine(db: Database, from: Date, at: Date): ThroughputLine {
  const unread = findUnreadLine(db, NAME, 'none');
  if (unread !== null) {
    return unread;
  }
  const filed = readFiledIssues(db, from, at);
  const closed = countSchema.parse(db.query(`SELECT COUNT(*) AS count FROM linear_issues WHERE state IN ('completed', 'canceled') AND closed_at >= ? AND closed_at < ?`).get(iso(from), iso(at)));
  const countOf = (source: IssueSource): number => filed.filter((issue) => issue.source === source).length;
  const split = [...SOURCES.map((source) => `${source} ${countOf(source)}`), ...SESSION_SOURCES.filter((source) => countOf(source) > 0).map((source) => `${source} ${countOf(source)}`)].join(', ');
  return { name: NAME, detail: `today ${filed.length} filed (${split}), ${closed.count} closed`, target: 'none', verdict: 'none', alerts: [] };
}
