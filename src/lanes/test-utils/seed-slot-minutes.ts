import { writeSlotMinutes } from '../write-slot-minutes.ts';
import { buildMockSlotMinutesInput } from './build-mock-slot-minutes-input.ts';
import type { LanesDeps, SlotMinutesInput } from './types.ts';

export function seedSlotMinutes(deps: LanesDeps, input: Partial<SlotMinutesInput> = {}): void {
  const slotMinutes = buildMockSlotMinutesInput(input);
  writeSlotMinutes(deps.db, slotMinutes.day, slotMinutes.cause, slotMinutes.minutes);
}
