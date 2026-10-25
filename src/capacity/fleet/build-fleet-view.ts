import { match } from 'ts-pattern';
import type { BurnPoint } from '../build-burn-rate.ts';
import type { UsageSample } from '../usage-sample.ts';
import { buildBlendedProfile } from './build-blended-profile.ts';
import type { BlendedProfile } from './build-blended-profile.ts';
import { buildLaneFactor } from './build-lane-factor.ts';
import { buildLaneModel } from './build-lane-model.ts';
import { buildLanePoints } from './build-lane-points.ts';
import { collectAccountSeries } from './collect-account-series.ts';
import { collectSlotReadings } from './collect-slot-readings.ts';
import { findActiveSlot } from './find-active-slot.ts';
import { findSafeCap } from './find-safe-cap.ts';
import { isSameSevenReset } from './is-same-seven-reset.ts';
import { makeLanesAt } from './make-lanes-at.ts';
import { simulateFleet } from './simulate-fleet.ts';
import type { SlotReadings } from './collect-slot-readings.ts';
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
  const readings = collectSlotReadings(input.rows, input.at);
  const newest = readings.known;
  const newestSample = input.samples.at(-1) ?? null;
  const sampleAgeMs = newestSample === null ? null : input.at.getTime() - Date.parse(newestSample.at);
  const staleMs = sampleAgeMs !== null && sampleAgeMs > SAMPLE_MAX_AGE_MS ? sampleAgeMs : null;
  const latest = staleMs === null ? newestSample : null;
  const active = findActiveSlot(newest, latest?.seven_day_resets_at ?? null);
  const base = { notSetUp: input.notSetUp, limit: FLEET_LIMIT, active, slots: buildSlotViews(readings, active, input.at), lanes: { working: input.working, cap: input.cap }, ratePerHour: null, scaled: null, forecast: null };
  if (input.notSetUp !== null) {
    return { ...base, note: 'slot reads are not set up' };
  }
  if (input.rows.length === 0) {
    return { ...base, note: 'no slot reads yet: hq capacity --refresh-slots reads them now' };
  }
  if (staleMs !== null) {
    return { ...base, note: `the newest usage sample is ${Math.floor(staleMs / 60_000)} min old` };
  }
  if (active === null || latest === null) {
    return { ...base, note: 'the active slot is unknown: no slot has the 7-day reset of the newest usage sample' };
  }
  const model = buildLaneModel(input.rows[0]?.at ?? null, buildLanePoints(input.rows, input.samples), input.at);
  const lanesAt = makeLanesAt(input.rows);
  const buildProfilesAt = (lanes: number) => buildProfiles(input.samples, latest.account, input.at, (time) => buildLaneFactor(model, lanesAt(time), lanes));
  const profiles = buildProfilesAt(input.working);
  if (profiles === null) {
    return { ...base, note: 'too few usage samples for a burn rate' };
  }
  const slots = buildSimSlots(newest, active, latest, input.samples);
  const simulate = (lanes: number) => {
    const scaled = lanes === input.working ? profiles : buildProfilesAt(lanes);
    if (scaled === null) {
      throw new Error('a burn profile that exists at one lane count exists at every lane count');
    }
    return simulateFleet({
      now: input.at,
      slots,
      active,
      limit: FLEET_LIMIT,
      rateAt: (time) => ({ five: scaled.five.rateAt(time), seven: scaled.seven.rateAt(time) }),
    });
  };
  if (!slots.some((slot) => slot.slot === active)) {
    return { ...base, note: 'the active slot has no 7-day figures in the newest usage sample' };
  }
  const result = simulate(input.working);
  const safeCap = result.pause === null ? null : findSafeCap(Math.max(input.cap ?? 0, input.working), simulate);
  return {
    ...base,
    ratePerHour: { five: profiles.five.rateAt(input.at), seven: profiles.seven.rateAt(input.at) },
    scaled: match(model)
      .with({ kind: 'scale' }, (scale) => scale.reason)
      .with({ kind: 'fit' }, () => null)
      .exhaustive(),
    forecast: { switches: result.switches, pause: result.pause, safeCap, endsAt: result.endsAt },
    note: null,
  };
}

function buildSlotViews(readings: SlotReadings, active: number | null, at: Date): FleetSlotView[] {
  const known = readings.known.map((row): FleetSlotView => ({ reading: 'known', slot: row.slot, active: row.slot === active, status: row.status, five: row.five, fiveResetsAt: row.fiveResetsAt, seven: row.seven, sevenResetsAt: row.sevenResetsAt, readAt: row.at, readAgeMin: buildReadAgeMin(row, at) }));
  const unknown = readings.unknown.map((row): FleetSlotView => ({ reading: 'unknown', slot: row.slot, active: false, status: row.status, readAt: row.at, readAgeMin: buildReadAgeMin(row, at) }));
  return [...known, ...unknown].toSorted((left, right) => left.slot - right.slot);
}

function buildReadAgeMin(row: SlotRow, at: Date): number {
  return Math.max(0, Math.floor((at.getTime() - Date.parse(row.at)) / 60_000));
}

const WEEK_MS = 7 * 86_400_000;

function buildProfiles(samples: readonly UsageSample[], account: string, at: Date, scaleAt: (time: string) => number): { five: BlendedProfile; seven: BlendedProfile } | null {
  const week = samples.filter((sample) => at.getTime() - Date.parse(sample.at) <= WEEK_MS);
  const active = week.filter((sample) => sample.account === account);
  const series = collectAccountSeries(week);
  const five = buildBlendedProfile(toPoints(active, 'five_hour', 'five_hour_resets_at'), series.map((points) => toPoints(points, 'five_hour', 'five_hour_resets_at')), at, scaleAt);
  const seven = buildBlendedProfile(toPoints(active, 'seven_day', 'seven_day_resets_at'), series.map((points) => toPoints(points, 'seven_day', 'seven_day_resets_at')), at, scaleAt);
  return five === null || seven === null ? null : { five, seven };
}

function toPoints(samples: readonly UsageSample[], percent: 'five_hour' | 'seven_day', resets: 'five_hour_resets_at' | 'seven_day_resets_at'): BurnPoint[] {
  return samples.map((sample) => ({ at: sample.at, percent: sample[percent], resetsAt: sample[resets] }));
}

function buildSimSlots(newest: readonly SlotRow[], active: number, latest: UsageSample, samples: readonly UsageSample[]): SimSlot[] {
  const slots: SimSlot[] = [];
  for (const row of newest) {
    const account = row.slot === active ? latest.account : null;
    const newer = collectNewerSamples(row, account, samples);
    const sevenSample = newer.findLast((sample) => sample.seven_day !== null && sample.seven_day_resets_at !== null);
    const seven = sevenSample === undefined ? row.seven : sevenSample.seven_day;
    const sevenResetsAt = sevenSample === undefined ? row.sevenResetsAt : sevenSample.seven_day_resets_at;
    if (seven === null || sevenResetsAt === null) {
      continue;
    }
    const fiveSample = newer.findLast((sample) => sample.five_hour !== null);
    const five = fiveSample === undefined ? row.five : fiveSample.five_hour;
    const fiveResetsAt = fiveSample === undefined ? row.fiveResetsAt : fiveSample.five_hour_resets_at;
    slots.push({ slot: row.slot, five: five ?? 0, fiveResetsAt: fiveResetsAt === null ? null : new Date(fiveResetsAt), seven, sevenResetsAt: new Date(sevenResetsAt) });
  }
  return slots;
}

// A slot's samples newer than its read, oldest first: the active slot's by its account, another's by
// its 7-day reset. Each window then takes the newest sample that holds a figure for it.
function collectNewerSamples(row: SlotRow, account: string | null, samples: readonly UsageSample[]): UsageSample[] {
  const rowResetsAt = row.sevenResetsAt;
  const newer = samples.filter((sample) => Date.parse(sample.at) > Date.parse(row.at));
  const matching = account === null ? newer.filter((sample) => rowResetsAt !== null && sample.seven_day_resets_at !== null && isSameSevenReset(sample.seven_day_resets_at, rowResetsAt)) : newer.filter((sample) => sample.account === account);
  return matching.toSorted((left, right) => Date.parse(left.at) - Date.parse(right.at));
}
