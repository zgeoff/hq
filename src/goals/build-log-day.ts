import { stepLogDay } from './step-log-day.ts';
import type { LogDay } from './step-log-day.ts';

// The day and time the goals reader holds at the end of the text.
export function buildLogDay(text: string): LogDay {
  let state: LogDay = { day: null, last: null };
  for (const line of text.split('\n')) {
    state = stepLogDay(state, line);
  }
  return state;
}
