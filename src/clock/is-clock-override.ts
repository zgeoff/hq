import { CLOCK_OVERRIDES } from './clock-overrides.ts';

export function isClockOverride(name: string): boolean {
  return CLOCK_OVERRIDES.some((override) => override === name);
}
