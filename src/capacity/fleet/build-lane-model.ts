import { buildLaneFit } from './build-lane-fit.ts';
import type { LanePoint } from './build-lane-fit.ts';
import type { LaneModel } from './build-lane-factor.ts';

const WEEK_MS = 7 * 86_400_000;

export function buildLaneModel(oldestReadAt: string | null, points: readonly LanePoint[], at: Date): LaneModel {
  const covered = oldestReadAt !== null && Date.parse(oldestReadAt) <= at.getTime() - WEEK_MS;
  if (!covered) {
    return { kind: 'scale', reason: 'history' };
  }
  const fit = buildLaneFit(points);
  return fit === null ? { kind: 'scale', reason: 'no-fit' } : { kind: 'fit', fit };
}
