import { formatResetTime } from '../format-reset-time.ts';
import type { FleetView } from './types.ts';

export interface FleetFingerprint {
  pauseStart: string;
  cap: number | null;
}

export type FleetNewsEffect = { kind: 'add-news'; text: string; fingerprint: FleetFingerprint } | { kind: 'clear-fingerprint' } | { kind: 'nothing' };

const MOVE_MS = 30 * 60_000;

export function pickFleetNews(view: FleetView, previous: FleetFingerprint | null): FleetNewsEffect {
  if (view.forecast === null) {
    return { kind: 'nothing' };
  }
  const pause = view.forecast.pause;
  if (pause === null) {
    return { kind: 'clear-fingerprint' };
  }
  const cap = view.forecast.safeCap?.lanes ?? null;
  if (previous !== null && previous.cap === cap && Math.abs(Date.parse(pause.start) - Date.parse(previous.pauseStart)) < MOVE_MS) {
    return { kind: 'nothing' };
  }
  const advice = cap === null ? 'no lane cap avoids it' : `a cap of ${cap} ${cap === 1 ? 'lane' : 'lanes'} avoids it`;
  return { kind: 'add-news', text: `Fleet forecast: every Claude slot is at ${view.limit}% from ${formatResetTime(pause.start)} for ${pause.hours.toFixed(1)} h at the current rate; ${advice}`, fingerprint: { pauseStart: pause.start, cap } };
}
