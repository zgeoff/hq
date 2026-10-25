import { buildBurnRate } from '../build-burn-rate.ts';
import type { UsageSample } from '../usage-sample.ts';
import type { LanePoint } from './build-lane-fit.ts';
import { collectAccountSeries } from './collect-account-series.ts';
import type { SlotRow } from './types.ts';

export function buildLanePoints(rows: readonly SlotRow[], samples: readonly UsageSample[]): LanePoint[] {
  const reads = new Map<string, number>();
  for (const row of rows) {
    reads.set(row.at, row.workingLanes);
  }
  const starts = [...reads.keys()].toSorted();
  const series = collectAccountSeries(samples);
  const points: LanePoint[] = [];
  for (let index = 1; index < starts.length; index += 1) {
    const from = starts[index - 1] ?? '';
    const to = starts[index] ?? '';
    for (const account of series) {
      const inGap = account.filter((sample) => sample.at >= from && sample.at <= to).map((sample) => ({ at: sample.at, percent: sample.seven_day, resetsAt: sample.seven_day_resets_at }));
      const rate = buildBurnRate(inGap).ratePerHour;
      if (rate !== null) {
        points.push({ lanes: reads.get(from) ?? 0, rate });
      }
    }
  }
  return points;
}
