import type { SlotMinutesInput } from './types.ts';

export function buildMockSlotMinutesInput(overrides: Partial<SlotMinutesInput> = {}): SlotMinutesInput {
  return { day: '2026-10-14', cause: 'delivery', minutes: 10, ...overrides };
}
