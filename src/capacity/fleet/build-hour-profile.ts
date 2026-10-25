import { getSydneyParts } from '../../clock/get-sydney-parts.ts';
import type { BurnPoint } from '../build-burn-rate.ts';
import { isBurnReset } from '../is-burn-reset.ts';

interface Bucket {
  hour: number;
  gained: number;
  hours: number;
}

export function buildHourProfile(series: readonly (readonly BurnPoint[])[]): (number | null)[] {
  const buckets = new Map<string, Bucket>();
  for (const points of series) {
    addDeltas(buckets, points);
  }
  return Array.from({ length: 24 }, (_unused, hour) => {
    const rates = [...buckets.values()].filter((bucket) => bucket.hour === hour && bucket.hours > 0).map((bucket) => bucket.gained / bucket.hours);
    return rates.length === 0 ? null : rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  });
}

const HOUR_MS = 3_600_000;

function addDeltas(buckets: Map<string, Bucket>, points: readonly BurnPoint[]): void {
  const read = points.filter((point) => point.percent !== null);
  for (let index = 1; index < read.length; index += 1) {
    const previous = read[index - 1];
    const current = read[index];
    if (previous === undefined || current === undefined || isBurnReset(previous, current)) {
      continue;
    }
    const before = getSydneyParts(new Date(previous.at));
    const after = getSydneyParts(new Date(current.at));
    if (before.day !== after.day || before.hour !== after.hour) {
      continue;
    }
    const key = `${before.year}-${before.month}-${before.day}-${before.hour}`;
    const bucket = buckets.get(key) ?? { hour: before.hour, gained: 0, hours: 0 };
    bucket.gained += (current.percent ?? 0) - (previous.percent ?? 0);
    bucket.hours += (Date.parse(current.at) - Date.parse(previous.at)) / HOUR_MS;
    buckets.set(key, bucket);
  }
}
