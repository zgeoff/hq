import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { CLOSED_RUN_STATES } from '../transitions/closed-run-states.ts';
import { RUN_STATES } from '../transitions/run-states.ts';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { buildFocusPlan } from '../focus/build-focus-plan.ts';
import { buildFocusQueue } from '../focus/build-focus-queue.ts';
import { compareFocusIssues } from '../focus/compare-focus-issues.ts';
import { readFocus } from '../focus/read-focus.ts';
import type { Focus, FocusPlan } from '../focus/types.ts';
import { buildCapView } from './cap/build-cap-view.ts';
import type { CapView } from './cap/build-cap-view.ts';
import { countWorking } from './cap/count-working.ts';
import { readActiveCap } from './cap/read-active-cap.ts';
import { buildSlotPool } from './build-slot-pool.ts';
import type { SlotPool } from './build-slot-pool.ts';
import { buildDesignLanes } from './build-design-lanes.ts';
import { countOpenDesignRuns } from './count-open-design-runs.ts';
import { DEFAULT_DESIGN_SLOTS } from './default-design-slots.ts';
import type { DesignLanes } from './design-lanes.ts';
import { isSkipActive } from './is-skip-active.ts';
import { ISSUE_AREAS_KEY } from './issue-areas-key.ts';
import { loadImpRoom } from './load-imp-room.ts';
import { readDesignAsked } from './read-design-asked.ts';
import { readDesignBacklog } from './read-design-backlog.ts';
import { readDesignRuns } from './read-design-runs.ts';
import { readLaneSkips } from './read-lane-skips.ts';
import { readReadySnapshot } from './read-ready-snapshot.ts';
import { readRunningByPlace } from './read-running-by-place.ts';
import type { ReadySnapshot } from './ready-snapshot.ts';
import { slotsFrom } from './slots-from.ts';
import type { DesignSlots, LaneSkip, ReadyIssue, Sample } from './types.ts';

export interface SlotPlan {
  pool: SlotPool;
  focus: Focus | null;

  // What the free slots take, in order; null while the Ready read is unknown or stale.
  plan: FocusPlan | null;

  // When the Ready read the plan comes from was stored; null with the plan.
  readyReadAt: string | null;

  // Every eligible issue not on the board; null while unknown.
  eligible: number | null;

  // The 3 design lanes beside the pool: the open design runs, the lane counts, and the issues each lane
  // takes next. A design run holds no delivery slot, so none of this moves the pool or the cap.
  design: DesignLanes;

  skipped: LaneSkip[];

  cap: CapView;
}

// The lanes' plan for this look: the pool's free slots, filled from the focus terms in order, then any
// other eligible work. A focus change shows at the next look; running runs keep their slots.
export function readSlotPlan(db: Database, sample: Sample, at: Date = now(), capAt: Date = at): SlotPlan | null {
  if (!sample.slots || !sample.cap) {
    return null;
  }
  const running = readRunningByPlace(db, at);
  const room = loadImpRoom(db, { budgetSlots: slotsFrom(sample.cap, sample.impMib).slots, impMib: sample.impMib }, at);
  const active = readActiveCap(db, capAt);
  const working = countWorking(db, at);
  const capRoom = active === null ? null : Math.max(0, active.cap - working.count);
  const pool = buildSlotPool(sample.slots, running, { room, localRoom: sample.localRoom ?? null, capRoom });
  const cap = buildCapView(active, working, pool);
  const focus = readFocus(db);
  const snapshot = readReadySnapshot(db, at);
  const activeSkips = readLaneSkips(db).filter((skip) => isSkipActive(skip, at));
  const design = readDesignLanes(db, { slots: sample.design ?? DEFAULT_DESIGN_SLOTS, snapshot, skipped: activeSkips.map((skip) => skip.issue), at });
  if (snapshot === null) {
    return { pool, focus, plan: null, readyReadAt: null, eligible: null, design, skipped: [], cap };
  }
  const runIssues = readRunIssues(db);
  const leftOut = new Set([...runIssues, ...activeSkips.map((skip) => skip.issue)]);
  const queue = buildFocusQueue(snapshot.eligible, focus?.terms ?? [], leftOut);
  const plan = buildFocusPlan(queue, pool.free, focus?.reserves ?? [], readRunningByArea(db, running.issues));
  const eligibleIssues = new Set(snapshot.eligible.map((issue) => issue.identifier));
  const skipped = activeSkips.filter((skip) => eligibleIssues.has(skip.issue) && !runIssues.has(skip.issue));
  return { pool, focus, plan, readyReadAt: snapshot.at, eligible: queue.length, design, skipped, cap };
}

const issuesSchema = z.array(z.object({ issue: z.string(), state: z.enum(RUN_STATES) }));

interface DesignLanesLook {
  slots: DesignSlots;
  snapshot: ReadySnapshot | null;
  skipped: readonly string[];
  at: Date;
}

// The design lanes: the open design runs against the lane counts, and for each lane the issues waiting
// for it. An issue with an open run, or a lanes skip, waits for no lane.
function readDesignLanes(db: Database, look: DesignLanesLook): DesignLanes {
  const rows = issuesSchema.parse(db.query('SELECT issue, state FROM runs').all());
  const leftOut = new Set([...rows.filter((row) => !CLOSED_RUN_STATES.includes(row.state)).map((row) => row.issue), ...look.skipped]);
  const backlog = readDesignBacklog(db, look.at);
  const waiting = (issues: readonly ReadyIssue[]): string[] => {
    const seen = new Map(issues.filter((issue) => !leftOut.has(issue.identifier)).map((issue) => [issue.identifier, issue]));
    return [...seen.values()].toSorted(compareFocusIssues).map((issue) => issue.identifier);
  };
  return buildDesignLanes({
    slots: look.slots,
    open: countOpenDesignRuns(db),
    agentQueue: waiting(backlog?.agent ?? []),
    withGeoffQueue: waiting([...(look.snapshot?.design ?? []), ...(backlog?.withGeoff ?? [])]),
    asked: readDesignAsked(db),
  });
}

// The issues with a run, whether or not it holds a slot now: the lanes never pick it again. A closed
// run counts too, since the Ready read can still hold its issue and addRun refuses it until a reopen;
// a closed design run does not, since its issue is next built once it is Ready.
function readRunIssues(db: Database): Set<string> {
  const rows = issuesSchema.parse(db.query('SELECT issue, state FROM runs').all());
  const designPasses = new Set(readDesignRuns(db).filter((run) => CLOSED_RUN_STATES.includes(run.state)).map((run) => run.issue));
  return new Set(rows.filter((row) => !designPasses.has(row.issue)).map((row) => row.issue));
}

const AREAS_SCHEMA = z.record(z.string(), z.array(z.string()));

function readRunningByArea(db: Database, issues: readonly string[]): Record<string, number> {
  const areas = metaJson(db, ISSUE_AREAS_KEY, AREAS_SCHEMA, {});
  const counts: Record<string, number> = {};
  for (const area of issues.flatMap((issue) => areas[issue] ?? [])) {
    counts[area] = (counts[area] ?? 0) + 1;
  }
  return counts;
}
