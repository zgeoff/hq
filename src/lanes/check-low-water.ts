import assert from 'node:assert';
import type { LowWaterAction, LowWaterState } from './low-water-transitions.ts';
import { LOW_WATER_TRANSITIONS } from './low-water-transitions.ts';

export function checkLowWater(action: LowWaterAction, from: LowWaterState): void {
  const allowed: readonly LowWaterState[] = LOW_WATER_TRANSITIONS[action].from;

  // pickLowWaterMoves derives the action from the stored state, so a move the table lacks is a bug in hq
  assert.ok(allowed.includes(from), `low-water episode is ${from}: ${action} needs ${allowed.join(' or ')}`);
}
