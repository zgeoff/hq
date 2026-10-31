import { iso } from '../clock/iso.ts';
import { stepLogDay } from './step-log-day.ts';
import type { LogDay } from './step-log-day.ts';

// The line that gives text moved out of a log the day and time it had in place, so the goals reader
// dates its "- HH:MMZ" entries as before. Empty when the text before it sets no day.
export function buildLogDayContext(before: string): string {
  let state: LogDay = { day: null, last: null };
  for (const line of before.split('\n')) {
    state = stepLogDay(state, line);
  }
  if (state.last !== null) {
    return `<!-- day context: ${iso(new Date(state.last)).slice(0, 16)}Z -->\n`;
  }
  return state.day === null ? '' : `### ${state.day} (day context)\n`;
}
