import { HqError } from '../errors.ts';
import { DESIGN_LANES } from './design-lane.ts';
import type { DesignLane } from './design-lane.ts';

// hq run add --design: agent or with-geoff, or null when the flag is absent.
export function parseDesignFlag(value: string | undefined): DesignLane | null {
  if (value === undefined) {
    return null;
  }
  const lane = DESIGN_LANES.find((each) => each === value);
  if (lane === undefined) {
    throw new HqError('bad_args', `--design must be ${DESIGN_LANES.join(' or ')}`);
  }
  return lane;
}
