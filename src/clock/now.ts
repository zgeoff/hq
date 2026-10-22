import { config } from '../config/config.ts';

// HQ_NOW pins the clock for tests and dry runs.
export function now(): Date {
  const pinned = config().HQ_NOW;
  return pinned ? new Date(pinned) : new Date();
}
