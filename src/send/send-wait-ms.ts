import { config } from '../config/config.ts';

export function sendWaitMs(): number {
  const n = config().HQ_SEND_WAIT_MS;
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 60_000) : 15_000;
}
