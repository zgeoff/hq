import { HqError } from '../errors.ts';
import type { LaneConfig } from './types.ts';

export function checkLane(lanes: LaneConfig[], lane: string): string {
  if (!lanes.some((l) => l.name === lane)) throw new HqError('bad_args', `--lane must be one of ${lanes.map((l) => l.name).join(', ')}`);
  return lane;
}
