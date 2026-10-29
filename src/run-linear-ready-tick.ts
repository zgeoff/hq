import type { Database } from 'bun:sqlite';
import type { LaneConfig } from './areas/types.ts';
import { iso } from './clock/iso.ts';
import { now } from './clock/now.ts';
import { getMeta } from './db/get-meta.ts';
import { setMeta } from './db/set-meta.ts';
import { buildFocusKey } from './focus/build-focus-key.ts';
import { readFocus } from './focus/read-focus.ts';
import rulesTable from '../lanes.json';
import { readLinearReady } from './lanes/read-linear-ready.ts';
import { countFocusMatches } from './focus/count-focus-matches.ts';
import { readBacklogIssues } from './lanes/read-backlog-issues.ts';
import { writeDesignBacklog } from './lanes/write-design-backlog.ts';
import { toMessage } from './runs/to-message.ts';
import { writePromotableFocus } from './lanes/write-promotable-focus.ts';
import { validateLaneRules } from './lanes/validate-lane-rules.ts';
import type { Runner } from './runner/types.ts';
import type { LinearCall } from './linear/types.ts';
import { withDeadline } from './watcher/with-deadline.ts';

const READ_AT = 'lanes_ready_linear_at';

// At most every 10 min, read Ready per lane from Linear by lanes.json's rules. The throttle is set
// before the read, so a failed or late pass waits its 10 min too; the failure is kept in meta for
// the stale alert, and a page that answers after the deadline writes nothing. False when not due;
// refresh reads now whatever the throttle says, and restarts it.
interface LinearReadyTickDeps {
  call: LinearCall;
  run: Runner;
  readLanes: () => Promise<LaneConfig[] | null>;
  actor: string;
  deadlineMs: number;
  refresh?: boolean;
  now?: () => number;
}

export async function runLinearReadyTick(db: Database, deps: LinearReadyTickDeps): Promise<boolean> {
  const at = now();
  const last = Date.parse(getMeta(db, READ_AT) ?? '1970-01-01T00:00:00Z');
  if (deps.refresh !== true && at.getTime() - last < 10 * 60_000) {
    return false;
  }
  setMeta(db, READ_AT, iso(at));
  const abandoned = new AbortController();
  const cancellableCall: LinearCall = async (query, variables) => {
    const answer = await deps.call(query, variables);
    abandoned.signal.throwIfAborted();
    return answer;
  };
  const readClock = deps.now ?? (() => performance.now());
  const startedAt = readClock();
  try {
    const lanes = await deps.readLanes();
    const rules = validateLaneRules(rulesTable, lanes?.map((lane) => lane.name) ?? null);
    await withDeadline(readLinearReady(db, { call: cancellableCall, run: deps.run, actor: deps.actor, rules }), deps.deadlineMs, 'lanes Ready from Linear');
  } catch (error) {
    abandoned.abort();
    setMeta(db, 'lanes_ready_linear_error', (error instanceof Error ? error.message : String(error)).slice(0, 300));
    throw error;
  }
  setMeta(db, 'lanes_ready_linear_error', null);
  const leftMs = Math.max(0, deps.deadlineMs - (readClock() - startedAt));
  const focus = readFocus(db);
  const backlog = await withDeadline(readBacklogIssues(cancellableCall, rulesTable.team), leftMs, 'Backlog promotable count', abandoned).then(
    (issues) => ({ issues, error: null }),
    (error: unknown) => ({ issues: null, error: toMessage(error).slice(0, 300) }),
  );
  const count =
    backlog.issues === null
      ? null
      : countFocusMatches(
          backlog.issues.promotable.map((issue) => issue.facts),
          focus,
        );
  writePromotableFocus(db, { count, error: backlog.error, focus: buildFocusKey(focus), at });
  if (backlog.issues !== null) {
    writeDesignBacklog(db, { ...backlog.issues.design, at });
  }
  return true;
}
