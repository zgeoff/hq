import { CLOCK_OVERRIDES } from '../clock/clock-overrides.ts';

const CLOCK_LINE = new RegExp(`^Environment="?(${CLOCK_OVERRIDES.join('|')})=.*\\n?`, 'gmu');

// The unit text without the Environment= lines that set a clock override; any other line stays as it is.
export function stripClockSettings(text: string): string {
  return text.replace(CLOCK_LINE, '');
}
