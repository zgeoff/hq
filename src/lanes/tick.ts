// hq lanes: watch delivery capacity and nudge z-delivery when agent slots sit
// free while Ready work waits. z-delivery still picks the issues; hq reminds.
import type { Database } from 'bun:sqlite';
import { buildLanesSignature as signature } from '../areas/build-lanes-signature.ts';
import { lanesNudgeText } from '../areas/lanes-nudge-text.ts';
import type { LaneView } from '../areas/types.ts';
import { wants } from '../areas/wants.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { getMeta } from '../db/get-meta.ts';
import { metaJson } from '../db/meta-json.ts';
import { setMeta } from '../db/set-meta.ts';
import { strMap } from '../db/str-map.ts';
import { logEvent } from '../log-event.ts';
import { dropTopic } from '../outbox/drop-topic.ts';
import { enqueue } from '../outbox/enqueue.ts';
import { orchestratorName } from '../wake/orchestrator-name.ts';
import { checkReadyStale } from './check-ready-stale.ts';
import { eligibleNow } from './eligible-now.ts';
import { getLanesHold } from './get-lanes-hold.ts';
import { LANES } from './lanes.ts';
import { lanesNow } from './lanes-now.ts';
import { loadImpRoom } from './load-imp-room.ts';
import { nudgeText } from './nudge-text.ts';
import { slotsFrom } from './slots-from.ts';
import type { Sample, TickResult } from './types.ts';

// One look: record the sample, follow up old nudges, nudge if the gap is long
// enough and the state changed or the repeat time passed.
export function tick(db: Database, sample: Sample, actor: string): TickResult {
  return db
    .transaction((): TickResult => {
      const t = now();
      const at = iso(t);
      const views = lanesNow(db, sample);
      // Each lane keeps its own free-since: a lane that just opened doesn't inherit another's wait.
      const sinceBy = metaJson(db, 'lanes_free_since_by_lane', strMap, {});
      if (views && !sample.error) {
        for (const v of views) {
          if (wants(v)) sinceBy[v.name] ??= at;
          else delete sinceBy[v.name];
        }
        setMeta(db, 'lanes_free_since_by_lane', JSON.stringify(sinceBy));
      }
      const waited = (v: LaneView) => !!sinceBy[v.name] && (t.getTime() - Date.parse(sinceBy[v.name]!)) / 60_000 >= LANES.freeMinutes();
      const open = views?.filter(wants) ?? null; // worth filling now: what the samples count
      const fill = open?.filter(waited) ?? null; // and free 10+ min: what a nudge names
      const { freeMib, slots: impSlots } = sample.cap ? slotsFrom(sample.cap, sample.impMib) : { freeMib: null, slots: 0 };

      // By lane: the free slots in lanes worth filling, and their Ready. Else one pool of imp slots,
      // under impd's non-Nix line as the lanes are.
      // oxlint-disable-next-line one-var -- the tick's one-const-per-line style is GEO-1318's lint debt
      const slots = open ? open.reduce((a, v) => a + v.free, 0) : loadImpRoom(db, { budgetSlots: impSlots, impMib: sample.impMib }).slots;
      // Eligible: the fresh per-lane Ready over every lane with free slots, a fresh 0 included (a
      // lane that reported 0 is known, not stale). Unknown only when no free lane has a fresh report.
      const known = views?.filter((v) => v.free > 0 && v.ready !== null) ?? [];
      const eligible = views ? (known.length ? known.reduce((a, v) => a + v.ready!, 0) : null) : eligibleNow(db).count;
      const nudgeSlots = fill ? fill.reduce((a, v) => a + v.free, 0) : slots;
      db.query('INSERT INTO lanes_samples (at, free_mib, slots, eligible, error) VALUES (?, ?, ?, ?, ?)').run(at, freeMib, slots, eligible, sample.error);
      // oxlint-disable-next-line one-var -- the tick's one-const-per-line style is GEO-1318's lint debt
      const freeSlots = views ? views.reduce((a, v) => a + v.free, 0) : slots;
      if (!sample.error) {
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

      // Only the newest unsent nudge may go out, and none once the lanes are full:
      // an atc outage never ends in a burst of stale nudges.
      if (slots === 0 && !sample.error) dropTopic(db, orchestratorName(), 'lanes');
      if (sample.error) return result(false, `no reading: ${sample.error}`, getMeta(db, 'lanes_free_since'));
      if (slots === 0) {
        setMeta(db, 'lanes_free_since', null);
        return result(false, 'lanes full', null);
      }
      if (nudgeSlots === 0) return result(false, `${open!.length} lane(s) free, under ${LANES.freeMinutes()} min each`, getMeta(db, 'lanes_free_since'));
      let since = getMeta(db, 'lanes_free_since');
      if (!since) {
        since = at;
        setMeta(db, 'lanes_free_since', since);
      }
      const minutes = Math.floor((t.getTime() - new Date(since).getTime()) / 60_000);
      // By lane, each lane already waited its own time; the pool waits here.
      if (!views && minutes < LANES.freeMinutes()) return result(false, `free for ${minutes} min, under ${LANES.freeMinutes()}`, since);

      const hold = getLanesHold(db);
      if (hold) {
        dropTopic(db, orchestratorName(), 'lanes');
        return result(false, `held until ${hold.until}: ${hold.reason}`, since);
      }

      const detail = views ? signature(fill!) : null;
      const last = db.query('SELECT at, slots, eligible, detail FROM lanes_nudges ORDER BY id DESC LIMIT 1').get() as { at: string; slots: number; eligible: number | null; detail: string | null } | null;
      if (last && last.at >= since) {
        const same = detail !== null ? last.detail === detail : last.slots === nudgeSlots && last.eligible === eligible;
        const age = (t.getTime() - new Date(last.at).getTime()) / 60_000;
        if (same && age < LANES.repeatMinutes()) return result(false, `nudged ${Math.floor(age)} min ago, nothing changed`, since);
      }
      const text = views ? lanesNudgeText(fill!, (v) => Math.floor((t.getTime() - Date.parse(sinceBy[v.name]!)) / 60_000)) : nudgeText(slots, minutes, eligible);
      const seq = logEvent(db, 'hq', 'lanes', 'nudged', actor, null, null, { slots: nudgeSlots, minutes, eligible, freeMib, lanes: detail });
      enqueue(db, seq, orchestratorName(), text, 'lanes');
      db.query('INSERT INTO lanes_nudges (at, slots, free_minutes, eligible, event_seq, detail) VALUES (?, ?, ?, ?, ?, ?)').run(at, nudgeSlots, minutes, eligible, seq, detail);
      return result(true, text, since);
    })
    .immediate();
}
