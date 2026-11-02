import { stepLogDay } from './step-log-day.ts';
import type { LogDay } from './step-log-day.ts';

export function buildLogDay(text: string): LogDay {
  let state: LogDay = { day: null, last: null };
  for (const line of text.split('\n')) {
    state = stepLogDay(state, line);
  }
  return state;
}
