import { parseLanes } from '../areas/parse-lanes.ts';
import type { LaneConfig } from '../areas/types.ts';
import { readPacingFile } from './read-pacing-file.ts';

export async function readLanes(): Promise<LaneConfig[]> {
  const raw = await readPacingFile();
  return parseLanes(raw);
}
