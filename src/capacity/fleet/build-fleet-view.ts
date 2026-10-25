import { match } from 'ts-pattern';
import { getSydneyParts } from '../../clock/get-sydney-parts.ts';
import type { BurnPoint } from '../build-burn-rate.ts';
import type { UsageSample } from '../usage-sample.ts';
import { buildBlendedProfile } from './build-blended-profile.ts';
import { buildLaneFactor } from './build-lane-factor.ts';
import { buildLaneModel } from './build-lane-model.ts';
import { buildLanePoints } from './build-lane-points.ts';
import { findActiveSlot } from './find-active-slot.ts';
import { getNewestSlotRead } from './get-newest-slot-read.ts';
import { findSafeCap } from './find-safe-cap.ts';
import { simulateFleet } from './simulate-fleet.ts';
import type { FleetSlotView, FleetView, SimSlot, SlotRow } from './types.ts';

const FLEET_LIMIT = 95;
const SAMPLE_MAX_AGE_MS = 30 * 60_000;

export interface FleetViewInput {
  at: Date;

  notSetUp: string | null;
  rows: readonly SlotRow[];
  samples: readonly UsageSample[];
  working: number;
  cap: number | null;
}

export function buildFleetView(input: FleetViewInput): FleetView {
  const newest = getNewestSlotRead(input.rows);
  const newestSample = input.samples.at(-1) ?? null;
  const sampleAgeMs = newestSample === null ? null : input.at.getTime() - Date.parse(newestSample.at);
  const staleMs = sampleAgeMs !== null && sampleAgeMs > SAMPLE_MAX_AGE_MS ? sampleAgeMs : null;
  const latest = staleMs === null ? newestSample : null;
  const active = findActiveSlot(newest, latest?.seven_day_resets_at ?? null);
  const base = { notSetUp: input.notSetUp, limit: FLEET_LIMIT, active, slots: newest.map((row) => buildSlotView(row, active, input.at)), lanes: { working: input.working, cap: input.cap }, ratePerHour: null, scaled: false, forecast: null };
  if (input.notSetUp !== null) {
    return { ...base, note: 'slot reads are not set up' };
  }
  if (newest.length === 0) {
    return { ...base, note: 'no slot reads yet: hq capacity --refresh-slots reads them now' };
  }
  if (staleMs !== null) {
    return { ...base, note: `the newest usage sample is ${Math.floor(staleMs / 60_000)} min old` };
  }
  if (active === null || latest === null) {
    return { ...base, note: 'the active slot is unknown: no slot has the 7-day reset of the newest usage sample' };
  }
  const profiles = buildProfiles(input.samples, input.at);
  if (profiles === null) {
    return { ...base, note: 'too few usage samples for a burn rate' };
  }
  const model = buildLaneModel(
    input.rows[0]?.at ?? null,
    buildLanePoints(input.rows, input.samples),
    input.working,
    input.at,
  );
  const hour = getSydneyParts(input.at).hour;
  const slots = buildSimSlots(newest, active, latest);
  const simulate = (lanes: number) =>
    simulateFleet({
      now: input.at,
      slots,
      active,
      limit: FLEET_LIMIT,
      rateAt: (time) => {
        const factor = buildLaneFactor(model, lanes);
        const sydneyHour = getSydneyParts(time).hour;
        return { five: (profiles.five[sydneyHour] ?? 0) * factor, seven: (profiles.seven[sydneyHour] ?? 0) * factor };
      },
    });
  if (!slots.some((slot) => slot.slot === active)) {
    return { ...base, note: 'the active slot has no 7-day figures in the newest usage sample' };
  }
  const result = simulate(input.working);
  const safeCap = result.pause === null ? null : findSafeCap(Math.max(input.cap ?? 0, input.working), simulate);
  return {
    ...base,
    ratePerHour: { five: profiles.five[hour] ?? 0, seven: profiles.seven[hour] ?? 0 },
    scaled: match(model)
      .with({ kind: 'scale' }, () => true)
      .with({ kind: 'fit' }, () => false)
      .exhaustive(),
    forecast: { switches: result.switches, pause: result.pause, safeCap, endsAt: result.endsAt },
    note: null,
  };
}

function buildSlotView(row: SlotRow, active: number | null, at: Date): FleetSlotView {
  return { slot: row.slot, active: row.slot === active, status: row.status, five: row.five, fiveResetsAt: row.fiveResetsAt, seven: row.seven, sevenResetsAt: row.sevenResetsAt, readAt: row.at, readAgeMin: Math.max(0, Math.floor((at.getTime() - Date.parse(row.at)) / 60_000)) };
}

const WEEK_MS = 7 * 86_400_000;

function buildProfiles(samples: readonly UsageSample[], at: Date): { five: number[]; seven: number[] } | null {
  const recent = samples.filter((sample) => at.getTime() - Date.parse(sample.at) <= WEEK_MS);
  const five = buildBlendedProfile(toPoints(recent, 'five_hour', 'five_hour_resets_at'), at);
  const seven = buildBlendedProfile(toPoints(recent, 'seven_day', 'seven_day_resets_at'), at);
  return five === null || seven === null ? null : { five, seven };
}

function toPoints(samples: readonly UsageSample[], percent: 'five_hour' | 'seven_day', resets: 'five_hour_resets_at' | 'seven_day_resets_at'): BurnPoint[] {
  return samples.map((sample) => ({ at: sample.at, percent: sample[percent], resetsAt: sample[resets] }));
}

function buildSimSlots(newest: readonly SlotRow[], active: number, latest: UsageSample): SimSlot[] {
  const slots: SimSlot[] = [];
  for (const row of newest) {
    const live = row.slot === active;
    const seven = live ? latest.seven_day : row.seven;
    const sevenResetsAt = live ? latest.seven_day_resets_at : row.sevenResetsAt;
    if (seven === null || sevenResetsAt === null) {
      continue;
    }
    const fiveResetsAt = live ? latest.five_hour_resets_at : row.fiveResetsAt;
    slots.push({ slot: row.slot, five: (live ? latest.five_hour : row.five) ?? 0, fiveResetsAt: fiveResetsAt === null ? null : new Date(fiveResetsAt), seven, sevenResetsAt: new Date(sevenResetsAt) });
  }
  return slots;
}
