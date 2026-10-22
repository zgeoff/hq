import type { LaneView } from './types.ts';

// A lane to fill: free, and its own Ready is unknown or above 0, or it can lend.
export const wants = (v: LaneView) => v.free > 0 && (v.ready === null || v.ready > 0 || v.lendTo !== null);
