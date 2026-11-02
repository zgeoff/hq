import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { CLOSED_RUN_STATES } from '../transitions/closed-run-states.ts';
import { RUN_STATES } from '../transitions/run-states.ts';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { buildFocusPlan } from '../focus/build-focus-plan.ts';
import { buildFocusQueue } from '../focus/build-focus-queue.ts';
import { sortByFocus } from '../focus/sort-by-focus.ts';
import { readFocus } from '../focus/read-focus.ts';
import type { Focus, FocusPlan, FocusTerm } from '../focus/types.ts';
import { buildCapView } from './cap/build-cap-view.ts';
import type { CapView } from './cap/build-cap-view.ts';
import { countWorking } from './cap/count-working.ts';
import { readActiveCap } from './cap/read-active-cap.ts';
import { buildSlotPool } from './build-slot-pool.ts';
import type { SlotPool } from './build-slot-pool.ts';
import { buildDesignLanes } from './build-design-lanes.ts';
import { countOpenDesignRuns } from './count-open-design-runs.ts';
import { DESIGN_LANES } from './design-lane.ts';
import { DEFAULT_DESIGN_SLOTS } from './default-design-slots.ts';
import type { DesignLanes } from './design-lanes.ts';
import { isSkipActive } from './is-skip-active.ts';
import { ISSUE_AREAS_KEY } from './issue-areas-key.ts';
import { loadImpRoom } from './load-imp-room.ts';
import { readDesignAsked } from './read-design-asked.ts';
import { readDesignBacklog } from './read-design-backlog.ts';
import { readDesignRuns } from './read-design-runs.ts';
import type { DesignRun } from './read-design-runs.ts';
import { readLaneSkips } from './read-lane-skips.ts';
import { readReadySnapshot } from './read-ready-snapshot.ts';
import { readRunningByPlace } from './read-running-by-place.ts';
import type { ReadySnapshot } from './ready-snapshot.ts';
import { slotsFrom } from './slots-from.ts';
import type { DesignSlots, LaneSkip, ReadyIssue, Sample } from './types.ts';

export interface SlotPlan {
  pool: SlotPool;
  focus: Focus | null;
  plan: FocusPlan | null;
  readyReadAt: string | null;
  eligible: number | null;
  design: DesignLanes;
  skipped: LaneSkip[];
  cap: CapView;
}

const runsSchema = z.array(z.object({ issue: z.string(), state: z.enum(RUN_STATES), design_lane: z.enum(DESIGN_LANES).nullable() }));

export function readSlotPlan(db: Database, sample: Sample, at: Date = now(), capAt: Date = at): SlotPlan | null {
  if (!sample.slots || !sample.cap) {
    return null;
  }
  const designRuns = readDesignRuns(db);
  const running = readRunningByPlace(db, at, designRuns);
  const room = loadImpRoom(db, { budgetSlots: slotsFrom(sample.cap, sample.impMib).slots, impMib: sample.impMib }, at);
  const active = readActiveCap(db, capAt);
  const working = countWorking(db, at, designRuns);
  const capRoom = active === null ? null : Math.max(0, active.cap - working.count);
  const pool = buildSlotPool(sample.slots, running, { room, localRoom: sample.localRoom ?? null, capRoom });
  const cap = buildCapView(active, working, pool);
  const focus = readFocus(db);
  const snapshot = readReadySnapshot(db, at);
  const activeSkips = readLaneSkips(db).filter((skip) => isSkipActive(skip, at));
  const runs = runsSchema.parse(db.query('SELECT issue, state, design_lane FROM runs').all());
  const design = readDesignLanes(db, { slots: sample.design ?? DEFAULT_DESIGN_SLOTS, countsError: sample.designError ?? null, terms: focus?.terms ?? [], snapshot, runs, designRuns, skipped: activeSkips.map((skip) => skip.issue), at });
  if (snapshot === null) {
    return { pool, focus, plan: null, readyReadAt: null, eligible: null, design, skipped: [], cap };
  }
  const runIssues = collectRunIssues(runs);
  const leftOut = new Set([...runIssues, ...activeSkips.map((skip) => skip.issue)]);
  const queue = buildFocusQueue(snapshot.eligible, focus?.terms ?? [], leftOut);
  const places = sample.placeTypes ? { free: { imp: pool.impFree, local: pool.localFree }, types: sample.placeTypes } : null;
  const plan = buildFocusPlan(queue, { free: pool.free, places }, focus?.reserves ?? [], readRunningByArea(db, running.issues));
  const eligibleIssues = new Set(snapshot.eligible.map((issue) => issue.identifier));
  const skipped = activeSkips.filter((skip) => eligibleIssues.has(skip.issue) && !runIssues.has(skip.issue));
  return { pool, focus, plan, readyReadAt: snapshot.at, eligible: queue.length, design, skipped, cap };
}

type RunRow = z.infer<typeof runsSchema>[number];

interface DesignLanesLook {
  slots: DesignSlots;
  countsError: string | null;
  terms: readonly FocusTerm[];
  snapshot: ReadySnapshot | null;
  runs: readonly RunRow[];
  designRuns: readonly DesignRun[];
  skipped: readonly string[];
  at: Date;
}

function readDesignLanes(db: Database, look: DesignLanesLook): DesignLanes {
  const leftOut = new Set([...look.runs.map((row) => row.issue), ...look.skipped]);
  const backlog = readDesignBacklog(db, look.at);
  const waiting = (issues: readonly ReadyIssue[]): string[] => {
    const seen = new Map(issues.filter((issue) => !leftOut.has(issue.identifier)).map((issue) => [issue.identifier, issue]));
    return sortByFocus([...seen.values()], look.terms).map((entry) => entry.issue.identifier);
  };
  return buildDesignLanes({
    slots: look.slots,
    open: countOpenDesignRuns(look.designRuns),
    agentQueue: waiting(backlog?.agent ?? []),
    withGeoffQueue: waiting([...(look.snapshot?.design ?? []), ...(backlog?.withGeoff ?? [])]),
    asked: readDesignAsked(db, look.designRuns),
    countsError: look.countsError,
  });
}

// The Ready read can still hold a closed run's issue, refused until a reopen. A closed design_lane
// run turns into the build run, so it does not count; a pre-v46 Design-type run was the design
// outcome itself, so it does.
function collectRunIssues(runs: readonly RunRow[]): Set<string> {
  return new Set(runs.filter((row) => !(row.design_lane !== null && CLOSED_RUN_STATES.includes(row.state))).map((row) => row.issue));
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
