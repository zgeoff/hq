import { config } from '../config/config.ts';

export function quietWindow(): { start: number; end: number } {
  const [start, end] = config().HQ_QUIET.split('-').map(Number);
  return { start: start!, end: end! };
}
