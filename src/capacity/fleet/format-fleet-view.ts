import { formatResetTime } from '../format-reset-time.ts';
import type { FleetSlotView, FleetView } from './types.ts';

export function formatFleetView(view: FleetView): string[] {
  const slots = view.slots.map((slot) => `  ${formatSlot(slot)}`);
  const burn = view.ratePerHour === null ? [] : [`  burn now: 7d ${formatRate(view.ratePerHour.seven)} pt/h, 5h ${formatRate(view.ratePerHour.five)} pt/h at ${view.lanes.working} working lanes${view.scaled ? ' (scaled by lane count: under 7 days of lane history)' : ''}`];
  return ['Fleet:', ...slots, ...burn, `  ${formatVerdict(view)}`];
}

function formatSlot(slot: FleetSlotView): string {
  const mark = slot.active ? ' (active)' : '';
  const age = `read ${formatAge(slot.readAgeMin)} ago`;
  if (slot.five === null && slot.seven === null) {
    return `slot ${slot.slot}${mark}: no figures (${slot.status}), ${age}`;
  }
  return `slot ${slot.slot}${mark}: 5h ${formatWindow(slot.five, slot.fiveResetsAt)}, 7d ${formatWindow(slot.seven, slot.sevenResetsAt)}, ${age}`;
}

function formatAge(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

function formatWindow(percent: number | null, resetsAt: string | null): string {
  const used = percent === null ? '?' : `${Math.round(percent)}%`;
  return resetsAt === null ? used : `${used} (resets ${formatResetTime(resetsAt)})`;
}

function formatRate(rate: number): string {
  return `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}`;
}

function formatVerdict(view: FleetView): string {
  if (view.forecast === null) {
    return `fleet: no forecast, ${view.note ?? 'nothing to go on'}`;
  }
  const pause = view.forecast.pause;
  if (pause === null) {
    return `fleet: no pause before ${formatResetTime(view.forecast.endsAt)}`;
  }
  const safeCap = view.forecast.safeCap;
  const cap = safeCap === null ? 'no cap avoids it' : `a cap of ${safeCap.lanes} lasts until ${formatResetTime(safeCap.endsAt)}`;
  return `fleet: pauses ${formatResetTime(pause.start)} for ${pause.hours.toFixed(1)} h at the current rate; ${cap}`;
}
