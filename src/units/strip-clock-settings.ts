import { CLOCK_OVERRIDES } from '../clock/clock-overrides.ts';

const CLOCK_LINE = new RegExp(`^Environment="?(${CLOCK_OVERRIDES.join('|')})=.*\\n?`, 'gmu');

export function stripClockSettings(text: string): string {
  return text.replace(CLOCK_LINE, '');
}
