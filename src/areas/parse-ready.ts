import { HqError } from '../errors.ts';
import { checkLane } from './check-lane.ts';
import type { LaneConfig } from './types.ts';

// --lane nixie-slice=3,atc=0: every name a configured lane, every count a whole number.
export function parseReady(lanes: LaneConfig[], raw: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of raw.split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = /^([a-z][a-z0-9-]*)=(\d{1,4})$/.exec(part);
    if (!m) throw new HqError('bad_args', `--lane takes lane=count pairs, such as nixie-slice=3,atc=0; "${part}" isn't one`);
    checkLane(lanes, m[1]!);
    if (m[1]! in out) throw new HqError('bad_args', `--lane names ${m[1]} twice`);
    out[m[1]!] = Number(m[2]);
  }
  if (!Object.keys(out).length) throw new HqError('bad_args', '--lane needs at least one lane=count');
  return out;
}
