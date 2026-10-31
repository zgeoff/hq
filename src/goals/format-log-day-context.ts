import { iso } from '../clock/iso.ts';
import type { LogDay } from './step-log-day.ts';

// The line that puts the goals reader back in the given state before the text that follows it, so
// that text's "- HH:MMZ" entries keep their day. With no day, it clears whatever day an earlier block
// in the same file left, but only when the text has a line the reader would date from it.
export function formatLogDayContext(state: LogDay, following: string): string {
  if (state.last !== null) {
    return `<!-- day context: ${iso(new Date(state.last)).slice(0, 16)}Z -->\n`;
  }
  if (state.day !== null) {
    return `### ${state.day} (day context)\n`;
  }
  return /^- \d\d:\d\dZ\b|\b(?:DEPLOY|HOLD)\b/mu.test(following) ? '<!-- day context: none -->\n' : '';
}
