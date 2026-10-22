import { config } from '../config/config.ts';

// Quiet hours: no call or proposal opens. Default 03:00-07:00 Sydney.
export function quietWindow(): { start: number; end: number } {
  const [start, end] = config().HQ_QUIET.split('-').map(Number);
  return { start: start!, end: end! };
}
