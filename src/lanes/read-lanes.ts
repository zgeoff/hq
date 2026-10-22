import { parseLanes } from '../areas/parse-lanes.ts';
import type { LaneConfig } from '../areas/types.ts';
import { HqError } from '../errors.ts';
import { pacingPath } from './pacing-path.ts';

export async function readLanes(): Promise<LaneConfig[]> {
  let raw: unknown;
  try {
    raw = await Bun.file(pacingPath()).json();
  } catch (e) {
    throw new HqError('no_lanes', `can't read ${pacingPath()}: ${String((e as Error).message ?? e).slice(0, 200)}`);
  }
  return parseLanes(raw);
}
