import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { findUnreadLine } from './find-unread-line.ts';
import { formatItemList } from './format-item-list.ts';
import { pickStaleKind } from './pick-stale-kind.ts';
import type { StaleKind } from './pick-stale-kind.ts';
import type { ThroughputAlert, ThroughputLine } from './types.ts';

const NAME = 'Stale';
const DAY_MS = 86_400_000;

// In Progress issues with no open run and no session, and open runs whose issue is closed. Target 0
// older than 24 hours; only those alert.
export function readStaleLine(db: Database, _from: Date, at: Date): ThroughputLine {
  const unread = findUnreadLine(db, NAME, '0 older than 24h');
  if (unread !== null) {
    return unread;
  }
  const items = [...readUnrunItems(db), ...readClosedRunItems(db)];
  const old = items.filter((item) => at.getTime() - Date.parse(item.since) > DAY_MS);
  return {
    name: NAME,
    detail: `${old.length} older than 24h${formatItemList(old.map((item) => item.summary))}, ${items.length} in all`,
    target: '0 older than 24h',
    verdict: old.length === 0 ? 'green' : 'red',
    alerts: old.map((item) => item.alert),
  };
}

interface StaleItem {
  since: string;
  summary: string;
  alert: ThroughputAlert;
}

const startedRowSchema = z.object({ issue: z.string(), started_at: z.string() });
const prRowSchema = z.object({ issue: z.string(), ref: z.string(), status: z.string(), merged_at: z.string().nullable() });

function readUnrunItems(db: Database): StaleItem[] {
  const rows = db
    .query(
      `SELECT s.issue, s.started_at FROM linear_started s
       WHERE NOT EXISTS (SELECT 1 FROM runs r WHERE r.issue = s.issue AND r.closed_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM run_sessions rs WHERE rs.issue = s.issue AND rs.active = 1)
       ORDER BY s.issue`,
    )
    .all();
  const prRows = z.array(prRowSchema).parse(db.query('SELECT issue, ref, status, merged_at FROM linear_started_prs ORDER BY issue, ref').all());
  return z
    .array(startedRowSchema)
    .parse(rows)
    .flatMap((row) => {
      const prs = prRows.filter((pr) => pr.issue === row.issue).map((pr) => ({ ref: pr.ref, status: pr.status, mergedAt: pr.merged_at }));
      return buildUnrunItem(row.issue, row.started_at, pickStaleKind(row.started_at, prs));
    });
}

function buildUnrunItem(issue: string, startedAt: string, stale: StaleKind): StaleItem[] {
  return match(stale)
    .with({ kind: 'live' }, () => [])
    .with({ kind: 'done-open' }, ({ since, ref }) => [
      {
        since,
        summary: `${issue} In Progress, every PR merged`,
        alert: {
          key: `stale:done-open:${issue}`,
          text: `Stale: ${issue} is In Progress, but every PR merged (last ${ref} at ${since}). Close it, or name the live check or owner step that holds it.`,
          role: 'triage' as const,
        },
      },
    ])
    .with({ kind: 'stalled' }, ({ since }) => [
      {
        since,
        summary: `${issue} In Progress, no run, no open PR`,
        alert: {
          key: `stale:stalled:${issue}`,
          text: `Stale: ${issue} has been In Progress since ${startedAt} with no hq run, no session and no open PR. Relaunch its run, or move it out of In Progress.`,
          role: 'orchestrator' as const,
        },
      },
    ])
    .exhaustive();
}

const closedRowSchema = z.object({ issue: z.string(), state: z.enum(['completed', 'canceled']), closed_at: z.string() });

function readClosedRunItems(db: Database): StaleItem[] {
  const rows = db
    .query(
      `SELECT r.issue, l.state, l.closed_at FROM runs r JOIN linear_issues l ON l.issue = r.issue
       WHERE r.closed_at IS NULL AND l.state IN ('completed', 'canceled') AND l.closed_at IS NOT NULL
       ORDER BY r.issue`,
    )
    .all();
  return z
    .array(closedRowSchema)
    .parse(rows)
    .map((row) => ({
      since: row.closed_at,
      summary: `${row.issue} run open, issue ${row.state}`,
      alert: {
        key: `stale:open-run:${row.issue}`,
        text: `Stale: ${row.issue}'s hq run is still open, but Linear marked the issue ${row.state} at ${row.closed_at}. Close the run, or reopen the issue.`,
      },
    }));
}
