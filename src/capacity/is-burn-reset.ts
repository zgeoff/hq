import type { BurnPoint } from './build-burn-rate.ts';

const RESET_JUMP_MS = 60_000;
const RESET_DROP_POINTS = 10;

// A fall of 10 points, or a reset time that moved on by over a minute, starts a new window.
export function isBurnReset(previous: BurnPoint, current: BurnPoint): boolean {
  const fell = (previous.percent ?? 0) - (current.percent ?? 0) >= RESET_DROP_POINTS;
  const moved = previous.resetsAt !== null && current.resetsAt !== null && Date.parse(current.resetsAt) - Date.parse(previous.resetsAt) > RESET_JUMP_MS;
  return fell || moved;
}
