import { config } from '../config/config.ts';

// HQ_NOW pins the clock only in a run from source: config() drops it from the installed hq.
export function now(): Date {
  const pinned = config().HQ_NOW;
  return pinned ? new Date(pinned) : new Date();
}
