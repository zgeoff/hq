import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { now } from '../clock/now.ts';
import { metaJson } from '../db/meta-json.ts';
import { buildFocusPlan } from '../focus/build-focus-plan.ts';
import { buildFocusQueue } from '../focus/build-focus-queue.ts';
import { compareFocusIssues } from '../focus/compare-focus-issues.ts';
import { readFocus } from '../focus/read-focus.ts';
import type { Focus, FocusPlan } from '../focus/types.ts';
import { buildSlotPool } from './build-slot-pool.ts';
import type { SlotPool } from './build-slot-pool.ts';
import { isSkipActive } from './is-skip-active.ts';
import { ISSUE_AREAS_KEY } from './issue-areas-key.ts';
import { loadImpRoom } from './load-imp-room.ts';
import { readLaneSkips } from './read-lane-skips.ts';
import { readReadySnapshot } from './read-ready-snapshot.ts';
import { readRunningByPlace } from './read-running-by-place.ts';
import type { ReadySnapshot } from './ready-snapshot.ts';
import { slotsFrom } from './slots-from.ts';
import type { LaneSkip, Sample } from './types.ts';

export interface SlotPlan {
  pool: SlotPool;
  focus: Focus | null;

  // What the free slots take, in order; null while the Ready read is unknown or stale.
  plan: FocusPlan | null;

  // Every eligible issue not on the board; null while unknown.
  eligible: number | null;

  // The Design issue the design slot takes next, outside the pool; null when capacity.sh gives it no
  // room or no Design issue waits. hq cannot see whether a Design session holds the slot now.
  design: string | null;

  // The active skips whose issue is eligible and has no run: the work the lanes would take but for
  // the skip. Empty while the Ready read is unknown.
  skipped: LaneSkip[];
}

// The lanes' plan for this look: the pool's free slots, filled from the focus terms in order, then any
// other eligible work. A focus change shows at the next look; running runs keep their slots.
export function readSlotPlan(db: Database, sample: Sample, at: Date = now()): SlotPlan | null {
  if (!sample.slots || !sample.cap) {
    return null;
  }
  const running = readRunningByPlace(db, at);
  const room = loadImpRoom(db, { budgetSlots: slotsFrom(sample.cap, sample.impMib).slots, impMib: sample.impMib }, at);
  const pool = buildSlotPool(sample.slots, running, room, sample.localRoom ?? null);
  const focus = readFocus(db);
  const snapshot = readReadySnapshot(db, at);
  if (snapshot === null) {
    return { pool, focus, plan: null, eligible: null, design: null, skipped: [] };
  }
  const runIssues = readRunIssues(db);
  const activeSkips = readLaneSkips(db).filter((skip) => isSkipActive(skip, at));
  const leftOut = new Set([...runIssues, ...activeSkips.map((skip) => skip.issue)]);
  const queue = buildFocusQueue(snapshot.eligible, focus?.terms ?? [], leftOut);
  const plan = buildFocusPlan(queue, pool.free, focus?.reserves ?? [], readRunningByArea(db, running.issues));
  const design = sample.cap.design?.room === true ? findDesignPick(snapshot, leftOut) : null;
  const eligibleIssues = new Set(snapshot.eligible.map((issue) => issue.identifier));
  const skipped = activeSkips.filter((skip) => eligibleIssues.has(skip.issue) && !runIssues.has(skip.issue));
  return { pool, focus, plan, eligible: queue.length, design, skipped };
}

const issuesSchema = z.array(z.object({ issue: z.string() }));

// The issues with a run, whether or not it holds a slot now: the lanes never pick it again. A closed
// run counts too, since the Ready read can still hold its issue and addRun refuses it until a reopen.
function readRunIssues(db: Database): Set<string> {
  const rows = issuesSchema.parse(db.query('SELECT issue FROM runs').all());
  return new Set(rows.map((row) => row.issue));
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

function findDesignPick(snapshot: ReadySnapshot, onBoard: ReadonlySet<string>): string | null {
  const waiting = snapshot.design.filter((issue) => !onBoard.has(issue.identifier));
  return waiting.toSorted(compareFocusIssues).at(0)?.identifier ?? null;
}
