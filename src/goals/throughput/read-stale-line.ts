import type { Database } from 'bun:sqlite';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { pickStaleKind } from '../../linear/pick-stale-kind.ts';
import type { StaleKind } from '../../linear/pick-stale-kind.ts';
import { readStartedPrs } from '../../linear/read-started-prs.ts';
import { findUnreadLine } from './find-unread-line.ts';
import { formatItemList } from './format-item-list.ts';
import type { ThroughputAlert, ThroughputLine } from './types.ts';

const NAME = 'Stale';
const DAY_MS = 86_400_000;

export function readStaleLine(db: Database, _from: Date, at: Date): ThroughputLine {
  const unread = findUnreadLine(db, NAME, '0 older than 24h');
  if (unread !== null) {
    return unread;
  }
  const items = [...readUnrunItems(db), ...readClosedRunItems(db), ...readInReviewItems(db, at)];
  const old = items.filter((item) => item.immediate === true || at.getTime() - Date.parse(item.since) > DAY_MS);
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
  immediate?: true;
}

const startedRowSchema = z.object({ issue: z.string(), started_at: z.string() });

function readUnrunItems(db: Database): StaleItem[] {
  const rows = db
    .query(
      `SELECT s.issue, s.started_at FROM linear_started s
       WHERE NOT EXISTS (SELECT 1 FROM runs r WHERE r.issue = s.issue AND r.closed_at IS NULL)
         AND NOT EXISTS (SELECT 1 FROM run_sessions rs WHERE rs.issue = s.issue AND rs.active = 1)
       ORDER BY s.issue`,
    )
    .all();
  const prs = readStartedPrs(db);
  return z
    .array(startedRowSchema)
    .parse(rows)
    .flatMap((row) => buildUnrunItem(row.issue, row.started_at, pickStaleKind(row.started_at, prs.get(row.issue) ?? [])));
}

function buildUnrunItem(issue: string, startedAt: string, stale: StaleKind): StaleItem[] {
  return match(stale)
    .with({ kind: 'live' }, () => [])
    .with({ kind: 'done-open' }, (done) => [
      {
        since: done.since,
        summary: `${issue} In Progress, every PR merged`,
        alert: {
          key: `stale:done-open:${issue}`,
          text: `Stale: ${issue} is In Progress, but every PR merged (last ${done.ref}, ${done.mergedAt === null ? 'merge time unknown' : `at ${done.mergedAt}`}). Close it, or name the live check or owner step that holds it.`,
          role: 'triage' as const,
        },
      },
    ])
    .with({ kind: 'stalled' }, (stalled) => [
      {
        since: stalled.since,
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

const inReviewRowSchema = z.object({ issue: z.string(), updated_at: z.string(), run_state: z.enum(['merged', 'live-check', 'dropped']).nullable() });

const IN_REVIEW_QUIET_MS = 2 * DAY_MS;

// A run in any other state has an owner moving the issue, so only these states and no run at all are read.
function readInReviewItems(db: Database, at: Date): StaleItem[] {
  const rows = db
    .query(
      `SELECT i.issue, i.updated_at, r.state AS run_state FROM linear_in_review i LEFT JOIN runs r ON r.issue = i.issue
       WHERE (r.state IS NULL OR r.state IN ('merged', 'live-check', 'dropped'))
         AND NOT EXISTS (
           SELECT 1 FROM unblocks u, json_each(u.unblocks) j
           WHERE u.state = 'open' AND u.kind = 'watch' AND json_extract(j.value, '$.issue') = i.issue)
       ORDER BY i.issue`,
    )
    .all();
  return z
    .array(inReviewRowSchema)
    .parse(rows)
    .filter((row) => row.run_state === 'dropped' || at.getTime() - Date.parse(row.updated_at) > IN_REVIEW_QUIET_MS)
    .map((row) => buildInReviewItem(row.issue, row.updated_at, row.run_state));
}

const IN_REVIEW_WAY_OUT = {
  merged: 'Run its live check, record `hq run check <issue> none` if it has none, add a watch with `hq unblock add` for what it waits on, or close it.',
  'live-check': 'Run the live check and close it, or add a watch with `hq unblock add` for what it waits on.',
  dropped: 'Its run was dropped: close or cancel the issue, or relaunch it.',
  none: 'Close it, or add a watch with `hq unblock add` for what it waits on.',
} as const;

function buildInReviewItem(issue: string, updatedAt: string, runState: 'merged' | 'live-check' | 'dropped' | null): StaleItem {
  const key = runState ?? 'none';
  const wayOut = IN_REVIEW_WAY_OUT[key].replace('<issue>', issue);
  const cause = runState === null ? 'it has no hq run' : `its hq run is ${runState}`;
  return {
    since: updatedAt,
    summary: `${issue} In Review, ${runState === null ? 'no run' : `run ${runState}`}`,
    alert: {
      key: `stale:in-review:${issue}`,
      text: `Stale: ${issue} is In Review (Linear last updated ${updatedAt}) and ${cause}, with no open watch naming it. ${wayOut}`,
      role: 'triage',
    },
    ...(runState === 'dropped' ? { immediate: true as const } : {}),
  };
}
