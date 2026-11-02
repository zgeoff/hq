import { iso } from '../clock/iso.ts';
import type { LogDay } from './step-log-day.ts';

export function formatLogDayContext(state: LogDay, following: string): string {
  if (state.last !== null) {
    return `<!-- day context: ${iso(new Date(state.last)).slice(0, 16)}Z -->\n`;
  }
  if (state.day !== null) {
    return `### ${state.day} (day context)\n`;
  }
  return /^- \d\d:\d\dZ\b|\b(?:DEPLOY|HOLD)\b/mu.test(following) ? '<!-- day context: none -->\n' : '';
}
