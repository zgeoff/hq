import { iso } from '../../clock/iso.ts';
import type { SimInput, SimPause, SimResult, SimSlot, SimSwitch } from './types.ts';

const STEP_MS = 15 * 60_000;
const STEP_HOURS = 0.25;
const MAX_MS = 8 * 86_400_000;
const FIVE_HOUR_MS = 5 * 3_600_000;

export function simulateFleet(input: SimInput): SimResult {
  const slots = input.slots.map((slot) => rollResets({ ...slot }, input.now));
  const endMs = Math.min(input.now.getTime() + MAX_MS, Math.max(...slots.map((slot) => slot.sevenResetsAt.getTime())));
  const switches: SimSwitch[] = [];
  let active: number | null = input.active;
  let pauseStart: number | null = null;
  let pause: SimPause | null = null;
  for (let time = input.now.getTime(); time < endMs; time += STEP_MS) {
    for (const slot of slots) {
      rollResets(slot, new Date(time));
    }
    const before = active;
    const current = slots.find((slot) => slot.slot === before);
    if (current === undefined || isOver(current, input.limit)) {
      const next = pickRoomiest(
        slots.filter((slot) => slot.slot !== before),
        input.limit,
      );
      if (next === null && pauseStart === null) {
        pauseStart = time;
      }
      if (next !== null) {
        switches.push({ at: iso(new Date(time)), from: before, to: next.slot });
        pause ??= pauseStart === null ? null : buildPause(pauseStart, time);
        pauseStart = null;
      }
      active = next?.slot ?? null;
    }
    const burner = active;
    const burning = slots.find((slot) => slot.slot === burner);
    if (burning !== undefined) {
      const rate = input.rateAt(new Date(time));
      burning.five = Math.min(100, burning.five + rate.five * STEP_HOURS);
      burning.seven = Math.min(100, burning.seven + rate.seven * STEP_HOURS);
      if (burning.five > 0) {
        burning.fiveResetsAt ??= new Date(time + FIVE_HOUR_MS);
      }
    }
  }
  pause ??= pauseStart === null ? null : buildPause(pauseStart, endMs);
  return { switches, pause, endsAt: iso(new Date(endMs)) };
}

const WEEK_MS = 7 * 86_400_000;

function rollResets(slot: SimSlot, at: Date): SimSlot {
  while (slot.sevenResetsAt.getTime() <= at.getTime()) {
    slot.seven = 0;
    slot.sevenResetsAt = new Date(slot.sevenResetsAt.getTime() + WEEK_MS);
  }
  while (slot.fiveResetsAt !== null && slot.fiveResetsAt.getTime() <= at.getTime()) {
    slot.five = 0;
    slot.fiveResetsAt = new Date(slot.fiveResetsAt.getTime() + FIVE_HOUR_MS);
  }
  return slot;
}

function isOver(slot: SimSlot, limit: number): boolean {
  return Math.max(slot.five, slot.seven) >= limit;
}

function pickRoomiest(slots: readonly SimSlot[], limit: number): SimSlot | null {
  const under = slots.filter((slot) => !isOver(slot, limit));
  return under.toSorted((left, right) => Math.max(left.five, left.seven) - Math.max(right.five, right.seven) || left.slot - right.slot)[0] ?? null;
}

function buildPause(startMs: number, endMs: number): SimPause {
  return { start: iso(new Date(startMs)), end: iso(new Date(endMs)), hours: (endMs - startMs) / 3_600_000 };
}
