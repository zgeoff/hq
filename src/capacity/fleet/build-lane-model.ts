import { buildLaneFit } from './build-lane-fit.ts';
import type { LanePoint } from './build-lane-fit.ts';
import type { LaneModel } from './build-lane-factor.ts';

const WEEK_MS = 7 * 86_400_000;

export function buildLaneModel(oldestReadAt: string | null, points: readonly LanePoint[], current: number, at: Date): LaneModel {
  const covered = oldestReadAt !== null && Date.parse(oldestReadAt) <= at.getTime() - WEEK_MS;
  const fit = covered ? buildLaneFit(points) : null;
  return fit === null ? { kind: 'scale', current } : { kind: 'fit', fit, current };
}
