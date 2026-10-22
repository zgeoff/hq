// hq lanes: watch delivery capacity and nudge z-delivery when agent slots sit
// free while Ready work waits. hq names the issues the focus picks; z-delivery launches them.
import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { logEvent } from '../log-event.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { checkReadyStale } from './check-ready-stale.ts';
import { eligibleNow } from './eligible-now.ts';
import { formatSlotNudge } from './format-slot-nudge.ts';
import { getLanesHold } from './get-lanes-hold.ts';
import { LANES } from './lanes.ts';
import { loadImpRoom } from './load-imp-room.ts';
import { nudgeText } from './nudge-text.ts';
import { readSlotPlan } from './read-slot-plan.ts';
import { removeLaneNudges } from './remove-lane-nudges.ts';
import { slotsFrom } from './slots-from.ts';
import type { Sample, TickResult } from './types.ts';

// One look: record the sample, follow up old nudges, nudge if the gap is long
// enough and the state changed or the repeat time passed.
export function tick(db: Database, sample: Sample, actor: string): TickResult {
  return db
    .transaction((): TickResult => {
      const t = now();
      const at = iso(t);
      const slotPlan = readSlotPlan(db, sample, t);
      const { freeMib, slots: impSlots } = sample.cap ? slotsFrom(sample.cap, sample.impMib) : { freeMib: null, slots: 0 };

      // With lanes: the slots worth filling now, the issues the plan picks (every free slot while Ready
      // is unknown). Else one pool of imp slots, under impd's non-Nix line as the lanes are.
      // oxlint-disable-next-line one-var -- the tick's one-const-per-line style is GEO-1318's lint debt
      const slots = slotPlan ? countWanted(slotPlan) : loadImpRoom(db, { budgetSlots: impSlots, impMib: sample.impMib }).slots;
      const eligible = slotPlan?.eligible ?? eligibleNow(db).count;
      db.query('INSERT INTO lanes_samples (at, free_mib, slots, eligible, error) VALUES (?, ?, ?, ?, ?)').run(at, freeMib, slots, eligible, sample.error);
      if (!sample.error) {
        const freeSlots = slotPlan ? slotPlan.pool.free : slots;
        checkReadyStale(db, t, freeSlots, actor);
      }

      // Follow up: did free slots drop after a nudge?
      const due = db.query('SELECT id, at FROM lanes_nudges WHERE slots_after IS NULL').all() as { id: number; at: string }[];
      for (const n of due) {
        if (t.getTime() - new Date(n.at).getTime() >= LANES.followMinutes() * 60_000 && sample.cap) {
          db.query('UPDATE lanes_nudges SET slots_after = ?, checked_at = ? WHERE id = ?').run(slots, at, n.id);
        }
      }

      const result = (nudged: boolean, why: string, freeSince: string | null): TickResult => ({
        at,
        freeMib,
        slots,
        eligible,
        freeSince,
        freeMinutes: freeSince ? Math.floor((t.getTime() - new Date(freeSince).getTime()) / 60_000) : 0,
        nudged,
        why,
        error: sample.error,
      });

      // Only the newest unsent nudge may go out, and none once nothing is left to fill:
      // an atc outage never ends in a burst of stale nudges.
      if (slots === 0 && !sample.error) {
        removeLaneNudges(db);
      }
      if (sample.error) return result(false, `no reading: ${sample.error}`, getMeta(db, 'lanes_free_since'));
      if (slots === 0) {
        setMeta(db, 'lanes_free_since', null);
        const why = slotPlan && slotPlan.pool.free > 0 ? `${slotPlan.pool.free} slot(s) free, nothing eligible` : 'lanes full';
        return result(false, why, null);
      }
      let since = getMeta(db, 'lanes_free_since');
      if (!since) {
        since = at;
        setMeta(db, 'lanes_free_since', since);
      }
      const minutes = Math.floor((t.getTime() - new Date(since).getTime()) / 60_000);
      if (minutes < LANES.freeMinutes()) {
        return result(false, `free for ${minutes} min, under ${LANES.freeMinutes()}`, since);
      }

      const hold = getLanesHold(db);
      if (hold) {
        removeLaneNudges(db);
        return result(false, `held until ${hold.until}: ${hold.reason}`, since);
      }

      const detail = slotPlan ? JSON.stringify({ picks: slotPlan.plan?.picks.map((pick) => pick.issue) ?? null, design: slotPlan.design, free: slotPlan.pool.free }) : null;
      const last = db.query('SELECT at, slots, eligible, detail FROM lanes_nudges ORDER BY id DESC LIMIT 1').get() as { at: string; slots: number; eligible: number | null; detail: string | null } | null;
      if (last && last.at >= since) {
        const same = detail === null ? last.slots === slots && last.eligible === eligible : last.detail === detail;
        const age = (t.getTime() - new Date(last.at).getTime()) / 60_000;
        if (same && age < LANES.repeatMinutes()) return result(false, `nudged ${Math.floor(age)} min ago, nothing changed`, since);
      }
      const text = slotPlan ? formatSlotNudge(slotPlan, minutes) : nudgeText(slots, minutes, eligible);
      const seq = logEvent(db, 'hq', 'lanes', 'nudged', actor, null, null, { slots, minutes, eligible, freeMib, lanes: detail });
      enqueue(db, seq, orchestratorName(), text, 'lanes');
      db.query('INSERT INTO lanes_nudges (at, slots, free_minutes, eligible, event_seq, detail) VALUES (?, ?, ?, ?, ?, ?)').run(at, slots, minutes, eligible, seq, detail);
      return result(true, text, since);
    })
    .immediate();
}

// The slots worth filling: each pick, or every free slot while Ready is unknown. The design slot's
// issue never counts: hq cannot see whether a Design session holds that slot, so it rides along in a
// nudge the pool sends and starts none.
function countWanted(slotPlan: NonNullable<ReturnType<typeof readSlotPlan>>): number {
  if (slotPlan.plan === null) {
    return slotPlan.pool.free;
  }
  return slotPlan.plan.picks.length;
}
