import { config } from '../config/config.ts';

export function now(): Date {
  const pinned = config().HQ_NOW;
  return pinned ? new Date(pinned) : new Date();
}
