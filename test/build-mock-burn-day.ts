import { getSydneyParts } from '../src/clock/get-sydney-parts.ts';
import { iso } from '../src/clock/iso.ts';
import type { BurnPoint } from '../src/capacity/build-burn-rate.ts';

// Half-hourly points for one Sydney day from midnight of 14 Oct 2026: 4.4 points an hour from 08:00
// to 18:00 and 0.7 an hour otherwise, with no window reset.
export function buildMockBurnDay(): BurnPoint[] {
  const points: BurnPoint[] = [];
  let percent = 0;
  for (let step = 0; step < 48; step += 1) {
    const time = new Date(Date.parse('2026-10-13T13:00:00Z') + step * 1_800_000);
    const hour = getSydneyParts(time).hour;

    points.push({ at: iso(time), percent, resetsAt: null });
    percent += (hour >= 8 && hour < 18 ? 4.4 : 0.7) * 0.5;
  }
  return points;
}
