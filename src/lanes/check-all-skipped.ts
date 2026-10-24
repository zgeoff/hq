import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { parkedRuns } from '../areas/parked-runs.ts';
import { RUNNING } from '../areas/running.ts';
import { now } from '../clock/now.ts';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { dropTopic } from '../outbox/drop-topic.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { forwardOf } from '../outbox/forward-of.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { getLanesHold } from './get-lanes-hold.ts';
import { IMP_LINE_HELD } from './imp-line-held.ts';
import type { SlotPlan } from './read-slot-plan.ts';
import type { LaneSkip } from './types.ts';

const TOLD = 'lanes_all_skipped_told';

// Its own topic: the nudge's topic is purged each look while no slot is wanted, which would drop this
// alert unsent.
const TOPIC = 'lanes-all-skipped';

// Tells z-delivery once per spell that every eligible Ready issue is skipped while slots sit free or
// impd's line holds imp slots back. A change of the held flag or the skip set tells again, and a look
// where the condition fails ends the spell. A lanes hold sends nothing.
export function checkAllSkipped(db: Database, slotPlan: SlotPlan, actor: string): boolean {
  const held = [IMP_LINE_HELD.memory, IMP_LINE_HELD.vcpu].some((line) => line === slotPlan.pool.held);
  if (slotPlan.eligible !== 0 || slotPlan.skipped.length === 0 || (slotPlan.pool.free === 0 && !held)) {
    setMeta(db, TOLD, null);
    removeAllSkippedAlerts(db);
    return false;
  }
  if (getLanesHold(db)) {
    removeAllSkippedAlerts(db);
    return false;
  }
  const key = `${held ? 'held' : 'free'} ${slotPlan.skipped.map((skip) => `${skip.issue} ${skip.until}`).toSorted().join(', ')}`;
  if (getMeta(db, TOLD) === key) {
    return false;
  }
  const impRuns = held ? readImpRuns(db) : [];
  const heldSlots = Math.max(0, slotPlan.pool.impSize - slotPlan.pool.impRunning - slotPlan.pool.impFree);
  const seq = logEvent(db, 'hq', 'lanes', 'all-skipped', actor, null, null, { free: slotPlan.pool.free, held: held ? slotPlan.pool.held : null, skips: slotPlan.skipped.map((skip) => skip.issue), impRuns });
  enqueue(db, seq, orchestratorName(), formatAllSkipped(slotPlan, { held, heldSlots, impRuns }), TOPIC);
  setMeta(db, TOLD, key);
  return true;
}

// A queued alert sits at the orchestrator's forwarded destination, not under its own name.
function removeAllSkippedAlerts(db: Database): void {
  const orchestrator = orchestratorName();
  dropTopic(db, orchestrator, TOPIC);
  dropTopic(db, forwardOf(db, orchestrator), TOPIC);
}

interface ImpRun {
  issue: string;
  state: string;
}

const impRunsSchema = z.array(z.object({ issue: z.string(), state: z.string() }));

// The runs that hold an imp slot now, parked ones left out.
function readImpRuns(db: Database): ImpRun[] {
  const parked = new Set(parkedRuns(db, now()).map((run) => run.issue));
  const rows = impRunsSchema.parse(db.query(`SELECT issue, state FROM runs WHERE place = 'imp' AND state IN (${RUNNING.map(() => '?').join(', ')}) ORDER BY issue`).all(...RUNNING));
  return rows.filter((row) => !parked.has(row.issue));
}

interface AllSkippedView {
  held: boolean;
  heldSlots: number;
  impRuns: ImpRun[];
}

function formatAllSkipped(slotPlan: SlotPlan, view: AllSkippedView): string {
  const clauses = [
    ...(slotPlan.pool.free > 0 ? [`${slotPlan.pool.free} slot(s) free`] : []),
    ...(view.held ? [`${view.heldSlots} imp slot(s) held by ${slotPlan.pool.held}`] : []),
  ];
  const holding = view.held ? ` Imp runs holding a slot: ${formatCapped(view.impRuns.map((run) => `${run.issue} (${run.state})`), ', ')}. Sleep any that only wait.` : '';
  const skips = formatCapped(slotPlan.skipped.map(formatSkip), '; ');
  return `Lanes: ${clauses.join(', ')}, and every eligible Ready issue is skipped.${holding} Check each skip still holds: ${skips}. Drop one with hq lanes skip drop <issue>.`;
}

const MAX_LISTED = 20;

function formatCapped(items: readonly string[], separator: string): string {
  const shown = items.slice(0, MAX_LISTED).join(separator);
  return items.length > MAX_LISTED ? `${shown}${separator}and ${items.length - MAX_LISTED} more` : shown;
}

function formatSkip(skip: LaneSkip): string {
  return `${skip.issue} until ${skip.until}: ${skip.reason}`;
}
