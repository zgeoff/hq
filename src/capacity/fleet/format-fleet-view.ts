import { match } from 'ts-pattern';
import { formatResetTime } from '../format-reset-time.ts';
import type { ScaleReason } from './build-lane-factor.ts';
import type { FleetSlotView, FleetView } from './types.ts';

export function formatFleetView(view: FleetView): string[] {
  const slots = view.slots.map((slot) => `  ${formatSlot(slot)}`);
  const burn = view.ratePerHour === null ? [] : [`  burn now: 7d ${formatRate(view.ratePerHour.seven)} pt/h, 5h ${formatRate(view.ratePerHour.five)} pt/h at ${view.lanes.working} working ${formatLaneWord(view.lanes.working)}${formatScaled(view.scaled)}`];
  return ['Fleet:', ...slots, ...burn, `  ${formatVerdict(view)}`];
}

function formatSlot(slot: FleetSlotView): string {
  return match(slot)
    .with({ reading: 'known' }, (known) => `slot ${known.slot}${known.active ? ' (active)' : ''}: 5h ${formatWindow(known.five, known.fiveResetsAt)}, 7d ${formatWindow(known.seven, known.sevenResetsAt)}, read ${formatAge(known.readAgeMin)} ago`)
    .with({ reading: 'unknown' }, (unknown) => `slot ${unknown.slot}: unknown, no reading with figures in the last 6 h (newest read ${unknown.status}, ${formatAge(unknown.readAgeMin)} ago)`)
    .exhaustive();
}

function formatWindow(percent: number | null, resetsAt: string | null): string {
  const used = percent === null ? '?' : `${Math.round(percent)}%`;
  return resetsAt === null ? used : `${used} (resets ${formatResetTime(resetsAt)})`;
}

function formatAge(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

function formatRate(rate: number): string {
  return `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}`;
}

function formatLaneWord(count: number): string {
  return count === 1 ? 'lane' : 'lanes';
}

function formatScaled(scaled: ScaleReason | null): string {
  return match(scaled)
    .with(null, () => '')
    .with('history', () => ' (scaled by lane count: under 7 days of lane history)')
    .with('no-fit', () => ' (scaled by lane count: the lane history fits no line)')
    .exhaustive();
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
  const cap = safeCap === null ? 'no cap avoids it' : `a cap of ${safeCap.lanes} ${formatLaneWord(safeCap.lanes)} lasts until ${formatResetTime(safeCap.endsAt)}`;
  return `fleet: pauses ${formatResetTime(pause.start)} for ${pause.hours.toFixed(1)} h at the current rate; ${cap}`;
}
